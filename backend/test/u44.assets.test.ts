// The asset/image upload workflow, driven through the router the way API Gateway drives it.
//
// S3 is replaced with an in-memory bucket so the whole flow (presign -> upload -> confirm -> delete)
// can run without AWS, but sharp is the real thing: the thumbnail assertions below check an actual
// resized image, which is the part most likely to break.

import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { RequestData } from "../src/utils/reqres/reqres.js";
import {
    AUTH_BASE,
    CLIENT_ID,
    MANAGE_AUTHORITY,
    anAdmin,
    authHeaders,
    fakeTokenVerifierModule,
    installFakeUserInfo,
    resetFakeAuth,
} from "./fakeAuth.js";

const BUCKET = "u44-test-bucket";
const ORIGIN = "https://urimalaward.com";
const ASSETS_BASE = "https://d111111abcdef8.cloudfront.net";

process.env.U44_S3_BUCKET_NAME = BUCKET;
process.env.U44_ALLOWED_ORIGIN_URLS = ORIGIN;
process.env.U44_ASSETS_BASE_URL = ASSETS_BASE;
process.env.U44_DYNAMO_DB_TABLE_NAME = "u44-test-table";
process.env.U44_OIDC_ISSUER = AUTH_BASE;
process.env.U44_AUTH_CLIENT_ID = CLIENT_ID;
process.env.U44_MANAGE_AUTHORITY_ID = MANAGE_AUTHORITY;

/** The fake bucket: key -> { body, contentType }. */
const objects = new Map<string, { body: Uint8Array; contentType: string }>();
const presignCalls: Array<{ key: string; contentType: string; expiresInSec: number }> = [];

vi.mock("../src/utils/aws/S3Utils.js", () => ({
    generateS3PresignedUploadURL: vi.fn(async (_fileName: string, contentType: string, _bucket: string, fileKey: string, expiresInSec: number) => {
        presignCalls.push({ key: fileKey, contentType, expiresInSec });
        return { url: `https://s3.example/${fileKey}?signed=1`, fileKey };
    }),
    headS3Object: vi.fn(async (key: string) => {
        const found = objects.get(key);
        return found ? { ContentType: found.contentType, ContentLength: found.body.byteLength } : null;
    }),
    getS3ObjectAsBytes: vi.fn(async (key: string) => objects.get(key)?.body ?? null),
    putS3BinaryObject: vi.fn(async (key: string, content: Uint8Array, contentType: string) => {
        objects.set(key, { body: content, contentType });
        return { status: 200, body: "Request successful" };
    }),
    moveS3Object: vi.fn(async (from: string, to: string) => {
        const found = objects.get(from);
        if (!found) throw new Error(`NoSuchKey: ${from}`);
        objects.set(to, found);
        objects.delete(from);
    }),
    deleteS3Object: vi.fn(async (key: string) => { objects.delete(key); }),
    listS3Objects: vi.fn(async (prefix: string) => [...objects.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, size: value.body.byteLength, lastModified: "2026-09-23T00:00:00.000Z" }))),
    getS3TextObject: vi.fn(async () => ""),
    putS3Object: vi.fn(async () => ({ status: 200, body: "Request successful" })),
}));

vi.mock("../src/utils/aws/DynamoDBUtils.js", async (importOriginal) => {
    const original = await importOriginal<typeof import("../src/utils/aws/DynamoDBUtils.js")>();
    const fake = await import("./fakeDynamoDB.js");
    // Only the five call wrappers are replaced: objToDynamoDBItem and the Ops types stay real, so
    // the key layout and the expressions under test are the ones the Lambda would send.
    return {
        ...original,
        dynamoDBPut: fake.dynamoDBPut,
        dynamoDBGet: fake.dynamoDBGet,
        dynamoDBQuery: fake.dynamoDBQuery,
        dynamoDBUpdate: fake.dynamoDBUpdate,
        dynamoDBDelete: fake.dynamoDBDelete,
    };
});

const { items } = await import("./fakeDynamoDB.js");
vi.mock("../src/u44be/auth/U44TokenVerifier.js", () => fakeTokenVerifierModule());

const restoreFetch = installFakeUserInfo();
const ADMIN_TOKEN = "admin-token";
const { handleRequest } = await import("../src/u44be/u44.handler.js");

function request(method: RequestData["method"], path: string, body: unknown = null): RequestData {
    return {
        path, method, body,
        // Management routes are gated, so these carry a signed-in admin's token. The public
        // /api/v0 reads ignore it.
        headers: { origin: ORIGIN, ...authHeaders(ADMIN_TOKEN) },
        cookies: {}, queryParams: {}, pathParams: {},
        context: new Map(),
    };
}

/** A real PNG, wide enough that the thumbnail has to shrink it. */
async function makePng(width = 1200, height = 900): Promise<Uint8Array> {
    return await sharp({
        create: { width, height, channels: 3, background: { r: 10, g: 40, b: 107 } },
    }).png().toBuffer();
}

beforeEach(() => {
    resetFakeAuth();
    anAdmin(ADMIN_TOKEN);
    objects.clear();
    items.clear();
    presignCalls.length = 0;
});

describe("image upload workflow", () => {
    it("presigns into the temporary prefix, then confirm moves it and writes a thumbnail", async () => {
        const created = await handleRequest(request("POST", "/api/management/v0/image", { fileName: "winner.png", contentType: "image/png" }));
        expect(created.status).toBe(200);
        const { assetTempKey, assetUploadURL, assetUploadUrlValidFor } = created.body as any;

        // The upload URL must point at the temporary prefix - that is what the one-day lifecycle
        // rule covers, so an abandoned upload cleans itself up.
        expect(presignCalls[0]!.key).toBe(`tmp/images/${assetTempKey}`);
        expect(presignCalls[0]!.contentType).toBe("image/png");
        expect(presignCalls[0]!.expiresInSec).toBe(60);
        expect(assetUploadURL).toContain("tmp/images/");
        expect(assetUploadUrlValidFor).toBe(60);

        // The client uploads straight to S3.
        objects.set(`tmp/images/${assetTempKey}`, { body: await makePng(), contentType: "image/png" });

        const confirmed = await handleRequest(request("POST", `/api/management/v0/image/${assetTempKey}`));
        expect(confirmed.status).toBe(200);
        const body = confirmed.body as any;

        expect(body.assetKey).toBe(`images/${assetTempKey}`);
        // "the same key as the image itself, but with a different prefix"
        expect(body.assetThumbnailKey).toBe(`images/thumbnails/${assetTempKey}`);
        expect(body.assetURL).toBe(`${ASSETS_BASE}/images/${assetTempKey}`);
        expect(body.assetThumbnailURL).toBe(`${ASSETS_BASE}/images/thumbnails/${assetTempKey}`);

        // The original moved out of the temporary prefix; both permanent objects exist.
        expect(objects.has(`tmp/images/${assetTempKey}`)).toBe(false);
        expect(objects.has(`images/${assetTempKey}`)).toBe(true);
        expect(objects.has(`images/thumbnails/${assetTempKey}`)).toBe(true);
    });

    it("resizes the thumbnail to 480px wide, like the frontend build script", async () => {
        const created = await handleRequest(request("POST", "/api/management/v0/image", { fileName: "winner.png", contentType: "image/png" }));
        const { assetTempKey } = created.body as any;
        objects.set(`tmp/images/${assetTempKey}`, { body: await makePng(1200, 900), contentType: "image/png" });
        await handleRequest(request("POST", `/api/management/v0/image/${assetTempKey}`));

        const thumbnail = objects.get(`images/thumbnails/${assetTempKey}`)!;
        const meta = await sharp(thumbnail.body).metadata();
        expect(meta.width).toBe(480);
        expect(meta.height).toBe(360); // aspect ratio kept
        expect(meta.format).toBe("png"); // same format as the original
        expect(thumbnail.contentType).toBe("image/png");
        // Only worth doing if it actually saves bytes.
        expect(thumbnail.body.byteLength).toBeLessThan(objects.get(`images/${assetTempKey}`)!.body.byteLength);
    });

    it("does not enlarge an image that is already smaller than the thumbnail width", async () => {
        const created = await handleRequest(request("POST", "/api/management/v0/image", { fileName: "small.png", contentType: "image/png" }));
        const { assetTempKey } = created.body as any;
        objects.set(`tmp/images/${assetTempKey}`, { body: await makePng(200, 150), contentType: "image/png" });
        await handleRequest(request("POST", `/api/management/v0/image/${assetTempKey}`));

        const meta = await sharp(objects.get(`images/thumbnails/${assetTempKey}`)!.body).metadata();
        expect(meta.width).toBe(200);
    });

    it("rejects a content type it cannot resize, before anything is uploaded", async () => {
        const res = await handleRequest(request("POST", "/api/management/v0/image", { fileName: "doc.pdf", contentType: "application/pdf" }));
        expect(res.status).toBe(400);
        expect(presignCalls).toHaveLength(0);
    });

    it("leaves the image in the temporary prefix when the upload is not an image", async () => {
        const created = await handleRequest(request("POST", "/api/management/v0/image", { fileName: "winner.png", contentType: "image/png" }));
        const { assetTempKey } = created.body as any;
        objects.set(`tmp/images/${assetTempKey}`, { body: new TextEncoder().encode("not an image"), contentType: "image/png" });

        const confirmed = await handleRequest(request("POST", `/api/management/v0/image/${assetTempKey}`));
        expect(confirmed.status).toBe(400);
        // Nothing became permanent; the lifecycle rule will remove the temporary object.
        expect(objects.has(`images/${assetTempKey}`)).toBe(false);
        expect(objects.has(`images/thumbnails/${assetTempKey}`)).toBe(false);
        expect(objects.has(`tmp/images/${assetTempKey}`)).toBe(true);
    });

    it("refuses to confirm an id that was never uploaded", async () => {
        const created = await handleRequest(request("POST", "/api/management/v0/image", { fileName: "winner.png", contentType: "image/png" }));
        const { assetTempKey } = created.body as any;
        const res = await handleRequest(request("POST", `/api/management/v0/image/${assetTempKey}`));
        expect(res.status).toBe(404);
    });

    it("deletes the image and its thumbnail together", async () => {
        const created = await handleRequest(request("POST", "/api/management/v0/image", { fileName: "winner.png", contentType: "image/png" }));
        const { assetTempKey } = created.body as any;
        objects.set(`tmp/images/${assetTempKey}`, { body: await makePng(), contentType: "image/png" });
        await handleRequest(request("POST", `/api/management/v0/image/${assetTempKey}`));

        const deleted = await handleRequest(request("DELETE", `/api/management/v0/image/${assetTempKey}`));
        expect(deleted.status).toBe(200);
        expect(objects.has(`images/${assetTempKey}`)).toBe(false);
        expect(objects.has(`images/thumbnails/${assetTempKey}`)).toBe(false);
    });
});

describe("generic asset workflow", () => {
    it("keeps the original extension and moves the file on confirm", async () => {
        const created = await handleRequest(request("POST", "/api/management/v0/asset", { fileName: "추천서_양식.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
        expect(created.status).toBe(200);
        const { assetTempKey } = created.body as any;
        expect(assetTempKey).toMatch(/\.docx$/);

        objects.set(`tmp/assets/${assetTempKey}`, { body: new TextEncoder().encode("docx bytes"), contentType: "application/octet-stream" });
        const confirmed = await handleRequest(request("POST", `/api/management/v0/asset/${assetTempKey}`));

        expect(confirmed.status).toBe(200);
        expect((confirmed.body as any).assetKey).toBe(`uploads/files/${assetTempKey}`);
        expect((confirmed.body as any).assetURL).toBe(`${ASSETS_BASE}/uploads/files/${assetTempKey}`);
        expect(objects.has(`uploads/files/${assetTempKey}`)).toBe(true);
        // An asset gets no thumbnail - that is images only.
        expect([...objects.keys()].some(k => k.startsWith("images/thumbnails/"))).toBe(false);
    });

    it("rejects an id that is not one we issued, so no prefix can be escaped", async () => {
        for (const bad of ["../configs/config1", "..%2Fconfigs%2Fconfig1", "not-a-uuid", ""]) {
            const res = await handleRequest(request("POST", `/api/management/v0/asset/${bad}`));
            expect(res.status, `should reject ${JSON.stringify(bad)}`).toBeGreaterThanOrEqual(400);
            expect(res.status).toBeLessThan(500);
        }
        expect(objects.size).toBe(0);
    });
});

describe("CORS", () => {
    it("answers a preflight from an allowed origin and rejects an unknown one", async () => {
        const preflight = await handleRequest({ ...request("OPTIONS", "/api/v0/award-info"), headers: { origin: ORIGIN } });
        expect(preflight.status).toBe(204);
        expect(preflight.headers?.["Access-Control-Allow-Origin"]).toBe(ORIGIN);

        const rejected = await handleRequest({ ...request("GET", "/api/v0/award-info"), headers: { origin: "https://evil.example" } });
        expect(rejected.status).toBe(403);
    });

    it("puts the CORS header on the actual response too, not just the preflight", async () => {
        const res = await handleRequest(request("GET", "/api/v0/award-info"));
        expect(res.status).toBe(200);
        expect(res.headers?.["Access-Control-Allow-Origin"]).toBe(ORIGIN);
    });
});


describe("the asset register", () => {
    /** Upload and confirm one image, returning its file name. */
    async function addImage(assetName?: string): Promise<string> {
        const created = await handleRequest(request("POST", "/api/management/v0/image", { fileName: "w.png", contentType: "image/png" }));
        const { assetTempKey } = created.body as any;
        objects.set(`tmp/images/${assetTempKey}`, { body: await makePng(600, 400), contentType: "image/png" });
        await handleRequest(request("POST", `/api/management/v0/image/${assetTempKey}`, assetName ? { assetName } : null));
        return assetTempKey;
    }

    it("lists confirmed images with both URLs, and never lists a thumbnail as an image", async () => {
        const first = await addImage();
        const second = await addImage();

        const res = await handleRequest(request("GET", "/api/management/v0/image"));
        expect(res.status).toBe(200);
        const list = res.body as any[];

        expect(list).toHaveLength(2);
        // The thumbnail prefix is nested inside the image prefix, so listing the *bucket* would
        // return it. Listing the table cannot, because a thumbnail never gets a record.
        expect(list.some(i => i.assetKey.startsWith("images/thumbnails/"))).toBe(false);

        const entry = list.find(i => i.assetKey === `images/${first}`)!;
        expect(entry.assetType).toBe("image");
        expect(entry.assetThumbnailKey).toBe(`images/thumbnails/${first}`);
        expect(entry.assetURL).toBe(`${ASSETS_BASE}/images/${first}`);
        expect(entry.assetThumbnailURL).toBe(`${ASSETS_BASE}/images/thumbnails/${first}`);
        expect(entry.assetContentType).toBe("image/png");
        expect(entry.size).toBeGreaterThan(0);
        expect(entry.created).toBeGreaterThan(0);

        // UUIDv7 sorts by creation time, so newest first falls out of the key order.
        expect(list[0]!.assetKey).toBe(`images/${second}`);
    });

    it("keeps the name the uploader gave, and falls back to the key when none is given", async () => {
        const named = await addImage("수상자 단체사진.png");
        const unnamed = await addImage();

        const list = (await handleRequest(request("GET", "/api/management/v0/image"))).body as any[];
        expect(list.find(i => i.assetKey === `images/${named}`)!.assetName).toBe("수상자 단체사진.png");
        // No name offered: the file name (which is the key) is the only label there is.
        expect(list.find(i => i.assetKey === `images/${unnamed}`)!.assetName).toBe(unnamed);
    });

    it("renames an image without moving the object the config points at", async () => {
        const only = await addImage("처음 이름.png");

        const renamed = await handleRequest(request("PATCH", `/api/management/v0/image/${only}`, { assetName: "  고친 이름.png  " }));
        expect(renamed.status).toBe(200);
        // Trimmed, and the key is untouched - a rename that moved the object would break every
        // award config entry referencing it.
        expect((renamed.body as any).assetName).toBe("고친 이름.png");
        expect((renamed.body as any).assetKey).toBe(`images/${only}`);
        expect(objects.has(`images/${only}`)).toBe(true);

        const list = (await handleRequest(request("GET", "/api/management/v0/image"))).body as any[];
        expect(list).toHaveLength(1);
        expect(list[0]!.assetName).toBe("고친 이름.png");
        expect(list[0]!.assetKey).toBe(`images/${only}`);
    });

    it("refuses an empty name and reports a rename of something that is not there", async () => {
        const only = await addImage("이름.png");

        const empty = await handleRequest(request("PATCH", `/api/management/v0/image/${only}`, { assetName: "   " }));
        expect(empty.status).toBe(400);

        const missing = await handleRequest(request("PATCH", "/api/management/v0/image/0199aaaa-bbbb-7ccc-8ddd-eeeeffff0000.png", { assetName: "x" }));
        expect(missing.status).toBe(404);

        // The first asset kept its name through both failures.
        const list = (await handleRequest(request("GET", "/api/management/v0/image"))).body as any[];
        expect(list[0]!.assetName).toBe("이름.png");
    });

    it("returns an empty list when nothing has been uploaded", async () => {
        const res = await handleRequest(request("GET", "/api/management/v0/image"));
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    it("drops an image from the list once it is deleted", async () => {
        const only = await addImage();
        await handleRequest(request("DELETE", `/api/management/v0/image/${only}`));
        const res = await handleRequest(request("GET", "/api/management/v0/image"));
        expect(res.body).toEqual([]);
    });

    it("keeps files and images in separate lists", async () => {
        await addImage("그림.png");

        const created = await handleRequest(request("POST", "/api/management/v0/asset", { fileName: "양식.docx", contentType: "application/octet-stream" }));
        const { assetTempKey } = created.body as any;
        objects.set(`tmp/assets/${assetTempKey}`, { body: new TextEncoder().encode("docx"), contentType: "application/octet-stream" });
        await handleRequest(request("POST", `/api/management/v0/asset/${assetTempKey}`, { assetName: "추천서 양식.docx" }));

        const images = (await handleRequest(request("GET", "/api/management/v0/image"))).body as any[];
        const files = (await handleRequest(request("GET", "/api/management/v0/asset"))).body as any[];

        expect(images.map(i => i.assetName)).toEqual(["그림.png"]);
        expect(files.map(i => i.assetName)).toEqual(["추천서 양식.docx"]);
        // A file has no thumbnail, so nothing should invent one for it.
        expect(files[0]!.assetThumbnailKey).toBe("");
        expect(files[0]!.assetThumbnailURL).toBe("");
    });

    it("leaves no record behind when an upload is never confirmed", async () => {
        await handleRequest(request("POST", "/api/management/v0/image", { fileName: "w.png", contentType: "image/png" }));
        // Presigned but never uploaded or confirmed: the lifecycle rule is the only cleanup needed,
        // because nothing was written to the table.
        expect(items.size).toBe(0);
        expect((await handleRequest(request("GET", "/api/management/v0/image"))).body).toEqual([]);
    });
});

describe("prefixes", () => {
    it("keeps uploaded files out of assets/, which the frontend build owns", async () => {
        // The site is served from this same bucket and Vite emits its bundles to assets/. An
        // uploaded file landing there would sit among the site's own JS and CSS.
        const created = await handleRequest(request("POST", "/api/management/v0/asset", { fileName: "form.docx", contentType: "application/octet-stream" }));
        const { assetTempKey } = created.body as any;
        objects.set(`tmp/assets/${assetTempKey}`, { body: new TextEncoder().encode("docx"), contentType: "application/octet-stream" });
        const confirmed = await handleRequest(request("POST", `/api/management/v0/asset/${assetTempKey}`, { assetName: "양식.docx" }));

        const key = (confirmed.body as any).assetKey as string;
        expect(key.startsWith("uploads/files/")).toBe(true);
        expect(key.startsWith("assets/")).toBe(false);
    });

    it("still puts unconfirmed uploads under tmp/, which the lifecycle rule expires", async () => {
        // The one-day TTL in template.yaml is keyed on the tmp/ prefix, so both temporary prefixes
        // have to stay underneath it.
        const asset = await handleRequest(request("POST", "/api/management/v0/asset", { fileName: "a.bin", contentType: "application/octet-stream" }));
        const image = await handleRequest(request("POST", "/api/management/v0/image", { fileName: "a.png", contentType: "image/png" }));
        expect((asset.body as any).assetUploadURL).toContain("tmp/assets/");
        expect((image.body as any).assetUploadURL).toContain("tmp/images/");
    });
});
