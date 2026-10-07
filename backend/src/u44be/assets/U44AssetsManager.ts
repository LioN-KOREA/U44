// Asset (file) and image upload workflow.
//
// Uploads never pass through the Lambda. The client asks for a presigned URL, PUTs the bytes
// straight to S3 under a temporary prefix, then calls confirm. Only confirm moves the object to
// its permanent prefix, so a client that walks away mid-upload leaves nothing behind that matters:
// a lifecycle rule on the temporary prefixes deletes unconfirmed objects after one day
// (see template.yaml — the rule is what actually enforces the TTL, not this code).
//
//   POST   /asset            -> { assetTempKey, assetUploadURL, assetUploadUrlValidFor }
//   PUT    <uploadURL>       -> (client -> S3, direct)
//   POST   /asset/:tid       -> the stored AssetEntry
//   PATCH  /asset/:aid       -> rename (label only; the object never moves)
//   DELETE /asset/:aid       -> { assetKey, assetThumbnailKey }
//
// Images take the same path, and confirm additionally writes a thumbnail. The thumbnail keeps the
// image's own file name and only swaps the prefix, so one name identifies both.
//
// DynamoDB, not S3, is the register of what exists. The object key is a UUID, which is all S3 needs
// but carries no name, no upload time and no content type that a listing can show; the table holds
// those. Confirm is the only step that writes a record, so anything listed is a finished upload.
// Listing therefore never calls ListObjectsV2 — see listAssetEntries.

import { getAppEnv } from "../env/u44.env.js";
import {
    deleteS3Object,
    generateS3PresignedUploadURL,
    getS3ObjectAsBytes,
    headS3Object,
    moveS3Object,
    putS3BinaryObject,
} from "../../utils/aws/S3Utils.js";
import { dynamoDBDelete, dynamoDBGet, dynamoDBPut, dynamoDBQuery, dynamoDBUpdate } from "../../utils/aws/DynamoDBUtils.js";
import { U44Asset, U44AssetDeleteOps, U44AssetGetOps, U44AssetPutOps, U44AssetQueryOps, U44AssetRenameOps } from "./U44Assets.dbops.js";
import { generateUuidV7 } from "../../utils/common/UUIDv7Utils.js";
import { ResponseData } from "../../utils/reqres/reqres.js";
import {
    AssetDeleteResponse,
    AssetEntry,
    AssetEntryCreationResponse,
} from "../u44.schemas.js";
import sharp from "sharp";

const BUCKET_NAME = getAppEnv().appS3BucketName;

/**
 * The file name of an asset: a UUIDv7 plus the original extension (ex. 0199ab...-c3.png).
 *
 * The id is handed back to the client and comes in again as a path parameter, so it is checked
 * against this shape before it is ever concatenated onto a prefix — otherwise a value such as
 * "../../configs/config1" would let a caller move or delete objects outside the asset prefixes.
 */
const ASSET_FILE_NAME_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{1,8})?$/i;

/** Extensions we accept, keyed by the content type the client says it is uploading. */
const IMAGE_CONTENT_TYPES: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
};

/** Generic assets may be anything, but the extension still has to be a plain, short one. */
const SAFE_EXTENSION_SHAPE = /^\.[a-z0-9]{1,8}$/i;

/** A display name is a label, not a path: it is trimmed and length-capped, never used as a key. */
const ASSET_NAME_MAX_LENGTH = 200;

function extensionFromFileName(fileName: string): string {
    const dot = fileName.lastIndexOf(".");
    if (dot < 0) return "";
    const ext = fileName.slice(dot).toLowerCase();
    return SAFE_EXTENSION_SHAPE.test(ext) ? ext : "";
}

/** Build the file name that both the temporary and the permanent key end with. */
function newAssetFileName(extension: string): string {
    return `${generateUuidV7()}${extension}`;
}

/** The public (CloudFront) URL for a stored object key. */
export function toAssetURL(objectKey: string): string {
    if (!objectKey) return "";
    if (/^https?:\/\//.test(objectKey)) return objectKey;
    const base = getAppEnv().appAssetsBaseURL.replace(/\/+$/, "");
    return `${base}/${objectKey.replace(/^\/+/, "")}`;
}

/** An image's thumbnail lives under its own prefix under the same file name. */
function toThumbnailKey(imageKey: string): string {
    const env = getAppEnv();
    return `${env.appS3AssetsThumbnailsPrefix}${imageKey.slice(env.appS3AssetsImagesPrefix.length)}`;
}

/** Fall back to the uploaded file's own name when the caller offers no label. */
function normalizeAssetName(assetName: string, fallback: string): string {
    const trimmed = assetName.trim().slice(0, ASSET_NAME_MAX_LENGTH);
    return trimmed.length > 0 ? trimmed : fallback;
}

/** Turn a stored record into the shape the API returns, deriving the URLs from the key. */
function toAssetEntry(asset: U44Asset): AssetEntry {
    const thumbnailKey = asset.assetType === "image" ? toThumbnailKey(asset.assetKey) : "";
    return {
        assetType: asset.assetType,
        assetName: asset.assetName,
        assetKey: asset.assetKey,
        assetURL: toAssetURL(asset.assetKey),
        assetContentType: asset.assetContentType,
        assetThumbnailKey: thumbnailKey,
        assetThumbnailURL: thumbnailKey ? toAssetURL(thumbnailKey) : "",
        size: asset.size,
        created: asset.created,
        lastModified: asset.lastModified,
    };
}

/* -------------------------------------------------------------------------- */
/* Shared steps                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Ask S3 for an upload URL under a temporary prefix.
 *
 * Nothing is written to the table here. An upload that is never confirmed leaves no record at all,
 * which is what keeps the listing free of half-finished uploads.
 */
async function createEntry(tempPrefix: string, fileName: string, contentType: string, extension: string): Promise<ResponseData<AssetEntryCreationResponse | string>> {
    const env = getAppEnv();
    const assetFileName = newAssetFileName(extension);
    try {
        const presigned = await generateS3PresignedUploadURL(
            assetFileName,
            contentType,
            BUCKET_NAME,
            `${tempPrefix}${assetFileName}`,
            env.appAssetUploadUrlValidForSec,
        );
        return {
            status: 200,
            body: {
                assetTempKey: assetFileName,
                assetUploadURL: presigned.url,
                assetUploadUrlValidFor: env.appAssetUploadUrlValidForSec,
            },
        };
    } catch (err) {
        console.error(`An error occurred while creating an upload entry (${fileName}) : ${err}`);
        return { status: 500, body: "An error occurred while creating the upload URL" };
    }
}

/** Write the record that makes an asset exist as far as the rest of the app is concerned. */
async function recordAsset(asset: U44Asset): Promise<boolean> {
    const put = await dynamoDBPut(U44AssetPutOps(asset));
    if (put.status !== 200) {
        console.error(`The asset record could not be stored (${asset.assetKey}) : ${put.message}`);
        return false;
    }
    return true;
}

/* -------------------------------------------------------------------------- */
/* Generic assets                                                             */
/* -------------------------------------------------------------------------- */

export async function createAssetEntry(fileName: string, contentType: string): Promise<ResponseData<AssetEntryCreationResponse | string>> {
    return createEntry(getAppEnv().appS3AssetsTempPrefix, fileName, contentType, extensionFromFileName(fileName));
}

export async function confirmAssetUpload(tempId: string, assetName: string): Promise<ResponseData<AssetEntry | string>> {
    const env = getAppEnv();
    if (!ASSET_FILE_NAME_SHAPE.test(tempId)) return { status: 400, body: "Invalid asset ID" };

    const tempKey = `${env.appS3AssetsTempPrefix}${tempId}`;
    const assetKey = `${env.appS3AssetsPrefix}${tempId}`;
    try {
        // The upload goes straight from the client to S3, so this is the only proof it arrived.
        const uploaded = await headS3Object(tempKey, BUCKET_NAME);
        if (!uploaded) return { status: 404, body: "No uploaded file was found for this asset ID" };

        await moveS3Object(tempKey, assetKey, BUCKET_NAME);

        const now = Date.now();
        const asset: U44Asset = {
            assetType: "file",
            assetName: normalizeAssetName(assetName, tempId),
            assetKey: assetKey,
            assetContentType: uploaded.ContentType ?? "application/octet-stream",
            size: uploaded.ContentLength ?? 0,
            created: now,
            lastModified: now,
        };
        if (!await recordAsset(asset)) return { status: 500, body: "An error occurred while storing the asset record" };

        return { status: 200, body: toAssetEntry(asset) };
    } catch (err) {
        console.error(`An error occurred while confirming the asset upload (${tempId}) : ${err}`);
        return { status: 500, body: "An error occurred while confirming the upload" };
    }
}

export async function deleteAssetEntry(assetId: string): Promise<ResponseData<AssetDeleteResponse | string>> {
    const env = getAppEnv();
    if (!ASSET_FILE_NAME_SHAPE.test(assetId)) return { status: 400, body: "Invalid asset ID" };

    const assetKey = `${env.appS3AssetsPrefix}${assetId}`;
    try {
        const existing = await headS3Object(assetKey, BUCKET_NAME);
        if (!existing) return { status: 404, body: "No asset was found for this asset ID" };

        await deleteS3Object(assetKey, BUCKET_NAME);
        // The record goes after the object: a record without its object shows a broken entry in the
        // UI, while an object without its record is invisible and the lifecycle of the bucket is
        // the only thing left holding it.
        const removed = await dynamoDBDelete(U44AssetDeleteOps(assetKey, "file"));
        if (removed.status !== 200) {
            console.error(`The asset object was deleted but its record was not (${assetKey}) : ${removed.message}`);
        }
        return { status: 200, body: { assetKey: assetKey, assetThumbnailKey: "" } };
    } catch (err) {
        console.error(`An error occurred while deleting the asset (${assetId}) : ${err}`);
        return { status: 500, body: "An error occurred while deleting the asset" };
    }
}

/* -------------------------------------------------------------------------- */
/* Images                                                                     */
/* -------------------------------------------------------------------------- */

export async function createImageEntry(fileName: string, contentType: string): Promise<ResponseData<AssetEntryCreationResponse | string>> {
    const extension = IMAGE_CONTENT_TYPES[contentType.toLowerCase()];
    // The content type is signed into the URL, so an unsupported one can never reach the bucket.
    if (!extension) {
        return { status: 400, body: `Unsupported image type : ${contentType} (allowed : ${Object.keys(IMAGE_CONTENT_TYPES).join(", ")})` };
    }
    return createEntry(getAppEnv().appS3AssetsImagesTempPrefix, fileName, contentType, extension);
}

/**
 * The width the list/grid thumbnails are generated at, and the per-format encoder settings.
 *
 * These mirror scripts/generate-thumbnails.mjs on the frontend (the `_tn` variant) so an image
 * uploaded here looks the same as one that was checked into public/ and resized at build time.
 * Keep the two in step if either is retuned.
 */
const THUMBNAIL_WIDTH = 480;

async function generateThumbnail(image: Uint8Array, contentType: string): Promise<Uint8Array> {
    const pipeline = sharp(image, { failOn: "none" }).resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true });
    switch (contentType.toLowerCase()) {
        case "image/webp":
            return await pipeline.webp({ quality: 78, effort: 5 }).toBuffer();
        case "image/png":
            // PNG only shrinks meaningfully once it is reduced to a palette.
            return await pipeline.png({ quality: 80, compressionLevel: 9, palette: true }).toBuffer();
        default:
            return await pipeline.jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    }
}

/**
 * Confirm an image upload: write the thumbnail first, then move the original into place.
 *
 * The thumbnail is written before the move so that an image only ever becomes permanent once its
 * thumbnail exists — the frontend asks for the thumbnail in list views, and a permanent image
 * without one would show a broken picture. If the thumbnail step fails the original stays in the
 * temporary prefix and the lifecycle rule cleans it up.
 */
export async function confirmImageUpload(tempId: string, assetName: string): Promise<ResponseData<AssetEntry | string>> {
    const env = getAppEnv();
    if (!ASSET_FILE_NAME_SHAPE.test(tempId)) return { status: 400, body: "Invalid image ID" };

    const tempKey = `${env.appS3AssetsImagesTempPrefix}${tempId}`;
    const imageKey = `${env.appS3AssetsImagesPrefix}${tempId}`;
    const thumbnailKey = `${env.appS3AssetsThumbnailsPrefix}${tempId}`;
    try {
        const uploaded = await headS3Object(tempKey, BUCKET_NAME);
        if (!uploaded) return { status: 404, body: "No uploaded file was found for this image ID" };

        const contentType = uploaded.ContentType ?? "image/jpeg";
        const original = await getS3ObjectAsBytes(tempKey, BUCKET_NAME);
        if (!original) return { status: 404, body: "No uploaded file was found for this image ID" };

        let thumbnail: Uint8Array;
        try {
            thumbnail = await generateThumbnail(original, contentType);
        } catch (err) {
            console.error(`The uploaded file could not be read as an image (${tempId}) : ${err}`);
            return { status: 400, body: "The uploaded file could not be read as an image" };
        }

        const thumbnailPut = await putS3BinaryObject(thumbnailKey, thumbnail, contentType, BUCKET_NAME);
        if (thumbnailPut.status !== 200) {
            return { status: thumbnailPut.status, body: `An error occurred while storing the thumbnail : ${thumbnailPut.body}` };
        }

        await moveS3Object(tempKey, imageKey, BUCKET_NAME);

        const now = Date.now();
        const asset: U44Asset = {
            assetType: "image",
            assetName: normalizeAssetName(assetName, tempId),
            assetKey: imageKey,
            assetContentType: contentType,
            size: uploaded.ContentLength ?? original.byteLength,
            created: now,
            lastModified: now,
        };
        if (!await recordAsset(asset)) return { status: 500, body: "An error occurred while storing the image record" };

        return { status: 200, body: toAssetEntry(asset) };
    } catch (err) {
        console.error(`An error occurred while confirming the image upload (${tempId}) : ${err}`);
        return { status: 500, body: "An error occurred while confirming the upload" };
    }
}

/** Delete an image and its thumbnail together, so a thumbnail is never left orphaned. */
export async function deleteImageEntry(imageId: string): Promise<ResponseData<AssetDeleteResponse | string>> {
    const env = getAppEnv();
    if (!ASSET_FILE_NAME_SHAPE.test(imageId)) return { status: 400, body: "Invalid image ID" };

    const imageKey = `${env.appS3AssetsImagesPrefix}${imageId}`;
    const thumbnailKey = `${env.appS3AssetsThumbnailsPrefix}${imageId}`;
    try {
        const existing = await headS3Object(imageKey, BUCKET_NAME);
        if (!existing) return { status: 404, body: "No image was found for this image ID" };

        await deleteS3Object(imageKey, BUCKET_NAME);
        // An image uploaded before thumbnails existed may not have one; deleting a missing key is
        // a no-op in S3, so this needs no separate check.
        await deleteS3Object(thumbnailKey, BUCKET_NAME);
        const removed = await dynamoDBDelete(U44AssetDeleteOps(imageKey, "image"));
        if (removed.status !== 200) {
            console.error(`The image objects were deleted but the record was not (${imageKey}) : ${removed.message}`);
        }
        return { status: 200, body: { assetKey: imageKey, assetThumbnailKey: thumbnailKey } };
    } catch (err) {
        console.error(`An error occurred while deleting the image (${imageId}) : ${err}`);
        return { status: 500, body: "An error occurred while deleting the image" };
    }
}

/* -------------------------------------------------------------------------- */
/* Listing and renaming                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Every confirmed asset of a type, newest first.
 *
 * This reads the table rather than the bucket. A bucket listing would return the thumbnails mixed
 * in with the originals and would know nothing of an asset's name, so the record is what the UI
 * gets. Records sort by key, and the keys end in a UUIDv7, so reversing the order is enough to put
 * the newest first without reading any timestamps.
 */
export async function listAssetEntries(assetType?: "image" | "file"): Promise<ResponseData<AssetEntry[] | string>> {
    try {
        const found = await dynamoDBQuery(U44AssetQueryOps(assetType), undefined, false);
        if (found.status !== 200) {
            console.error(`An error occurred while listing the assets : ${found.message}`);
            return { status: found.status, body: "An error occurred while listing the assets" };
        }
        return { status: 200, body: found.data.map(toAssetEntry) };
    } catch (err) {
        console.error(`An error occurred while listing the assets : ${err}`);
        return { status: 500, body: "An error occurred while listing the assets" };
    }
}

/**
 * Change an asset's display name.
 *
 * Only the record changes. The key is the object's identity and is referenced from the award
 * config, so renaming must never touch it — otherwise every config entry pointing at the asset
 * would break.
 */
export async function renameAssetEntry(assetType: "image" | "file", assetId: string, assetName: string): Promise<ResponseData<AssetEntry | string>> {
    const env = getAppEnv();
    if (!ASSET_FILE_NAME_SHAPE.test(assetId)) return { status: 400, body: "Invalid asset ID" };

    const newName = assetName.trim().slice(0, ASSET_NAME_MAX_LENGTH);
    if (newName.length === 0) return { status: 400, body: "The name cannot be empty" };

    const assetKey = `${assetType === "image" ? env.appS3AssetsImagesPrefix : env.appS3AssetsPrefix}${assetId}`;
    try {
        const updated = await dynamoDBUpdate(U44AssetRenameOps(assetType, assetKey, newName));
        if (updated.status !== 200) {
            console.error(`An error occurred while renaming the asset (${assetKey}) : ${updated.message}`);
            return { status: updated.status, body: "An error occurred while renaming the asset" };
        }
        // Read back rather than assembling a half-filled entry from what we happen to know here:
        // the caller refreshes its list from this response, so it has to be the whole record.
        const stored = await dynamoDBGet(U44AssetGetOps(assetType, assetKey));
        if (!stored.data) return { status: 404, body: "No asset was found for this asset ID" };
        return { status: 200, body: toAssetEntry(stored.data) };
    } catch (err) {
        // The condition on the update fails when there is no such record, which is a 404 and not a
        // server error - anything else really is unexpected.
        const isMissing = err instanceof Error && err.name === "ConditionalCheckFailedException";
        if (isMissing) return { status: 404, body: "No asset was found for this asset ID" };
        console.error(`An error occurred while renaming the asset (${assetKey}) : ${err}`);
        return { status: 500, body: "An error occurred while renaming the asset" };
    }
}
