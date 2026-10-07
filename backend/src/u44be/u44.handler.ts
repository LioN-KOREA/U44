import { addRoute, createRouter, findRoute } from "rou3";
import { ResponseData, RRHandler } from "../utils/reqres/reqres.js";
import { getAwardInfoConfig, getAwardInfoConfigRaw, updateAwardInfoConfig } from "./config/U44AwardConfigManager.js";
import * as v from 'valibot'
import {
    AssetConfirmRequestSchema,
    AssetEntryCreationRequestSchema,
    AssetRenameRequestSchema,
    AwardInfoConfigSchema,
    HomescreenConfigSchema,
    SocialMediaPostsConfigSchema,
} from "./u44.schemas.js";
import { getHomescreenConfig, getHomescreenConfigRaw, updateHomescreenConfig } from "./config/U44HomescreenManager.js";
import {
    getSocialMediaPostsConfig,
    getSocialMediaPostsConfigRaw,
    updateSocialMediaPostsConfig,
} from "./config/U44SocialMediaConfigManager.js";
import {
    confirmAssetUpload,
    confirmImageUpload,
    createAssetEntry,
    createImageEntry,
    deleteAssetEntry,
    deleteImageEntry,
    listAssetEntries,
    renameAssetEntry,
} from "./assets/U44AssetsManager.js";
import { getAppEnv } from "./env/u44.env.js";
import { CORS_HEADERS_REJECTED, generateCorsHeadersActual, generateCorsHeadersPreflight } from "../utils/common/CorsUtils.js";

const ALLOWED_ORIGINS = getAppEnv().appAllowedOriginURLs;

const ALLOWED_CORS_HEADERS = ["Authorization", "Content-Type", "X-Sec-Token"];
// PATCH is here for the asset rename, which changes one field of an existing record. The browser
// will not send a PATCH at all unless the preflight lists it.
const ALLOWED_CORS_METHODS = ["GET", "POST", "PATCH", "DELETE", "OPTIONS"];

/* The handlers that actuallly handle the request. */
const handleUpdateAwardInfoConfig: RRHandler = async (input) => {
    const p = v.safeParse(AwardInfoConfigSchema, input.body);
    if (!p.success) return { status: 400, body: `An error occurred while validating the request: ${p.issues}` }
    const newConfigData = p.output;
    return updateAwardInfoConfig(newConfigData);
}

const handleGetAwardInfoConfig: RRHandler = async () => {
    return getAwardInfoConfig();
}

/* The editor needs the stored keys, not the rewritten URLs - see getAwardInfoConfigRaw. */
const handleGetAwardInfoConfigRaw: RRHandler = async () => {
    return getAwardInfoConfigRaw();
}

/* Home screen: the banner, and the contact details shown in the footer. */
const handleUpdateHomescreenConfig: RRHandler = async (input) => {
    const p = v.safeParse(HomescreenConfigSchema, input.body);
    if (!p.success) return { status: 400, body: `An error occurred while validating the request: ${p.issues}` }
    return updateHomescreenConfig(p.output);
}

const handleGetHomescreenConfig: RRHandler = async () => {
    return getHomescreenConfig();
}

/*
 * The editor reads the stored config, which differs from the public one in two ways: asset keys are
 * left as keys, and no default banner is substituted - otherwise a save would turn "none chosen"
 * into a real choice.
 */
const handleGetHomescreenConfigRaw: RRHandler = async () => {
    return getHomescreenConfigRaw();
}

/* Social media posts (formerly instaposts.json). */
const handleUpdateSocialMediaPostsConfig: RRHandler = async (input) => {
    const p = v.safeParse(SocialMediaPostsConfigSchema, input.body);
    if (!p.success) return { status: 400, body: `An error occurred while validating the request: ${p.issues}` }
    return updateSocialMediaPostsConfig(p.output);
}

const handleGetSocialMediaPostsConfig: RRHandler = async () => {
    return getSocialMediaPostsConfig();
}

const handleGetSocialMediaPostsConfigRaw: RRHandler = async () => {
    return getSocialMediaPostsConfigRaw();
}

/* The lists the management UI picks award images (and, later, files) from. */
const handleListImageEntries: RRHandler = async () => {
    return listAssetEntries("image");
}

const handleListAssetEntries: RRHandler = async () => {
    return listAssetEntries("file");
}

/*
 * The display name travels with the confirm call, not with the presign call.
 *
 * Nothing is recorded until confirm, so there is nowhere to keep a name handed over earlier - and
 * the client knows the file name at both points anyway.
 */
const assetNameFromBody = (body: unknown): string => {
    const p = v.safeParse(AssetConfirmRequestSchema, body ?? {});
    return p.success ? p.output.assetName : "";
}

/* Assets: ask for an upload URL, upload straight to S3, then confirm to make it permanent. */
const handleCreateAssetEntry: RRHandler = async (input) => {
    const p = v.safeParse(AssetEntryCreationRequestSchema, input.body);
    if (!p.success) return { status: 400, body: `An error occurred while validating the request: ${p.issues}` }
    return createAssetEntry(p.output.fileName, p.output.contentType);
}

const handleCreateAssetUploadConfirm : RRHandler = async (input) => {
    const tempId = input.pathParams.tid ?? null;
    if (!tempId) return { status : 400, body : "Invalid asset ID" };
    return confirmAssetUpload(tempId, assetNameFromBody(input.body));
}

const handleRenameAssetEntry : RRHandler = async (input) => {
    const assetId = input.pathParams.aid ?? null;
    if (!assetId) return { status : 400, body : "Invalid asset ID" };
    const p = v.safeParse(AssetRenameRequestSchema, input.body);
    if (!p.success) return { status: 400, body: "The name has to be between 1 and 200 characters" }
    return renameAssetEntry("file", assetId, p.output.assetName);
}

const handleDeleteAssetEntry : RRHandler = async (input) => {
    const assetId = input.pathParams.aid ?? null;
    if (!assetId) return { status : 400, body : "Invalid asset ID" };
    return deleteAssetEntry(assetId);
}

/* Images: the same flow, except that confirming also writes a thumbnail. */
const handleCreateImageEntry: RRHandler = async (input) => {
    const p = v.safeParse(AssetEntryCreationRequestSchema, input.body);
    if (!p.success) return { status: 400, body: `An error occurred while validating the request: ${p.issues}` }
    return createImageEntry(p.output.fileName, p.output.contentType);
}

const handleCreateImageUploadConfirm : RRHandler = async (input) => {
    const tempId = input.pathParams.tid ?? null;
    if (!tempId) return { status : 400, body : "Invalid asset ID" };
    return confirmImageUpload(tempId, assetNameFromBody(input.body));
}

const handleRenameImageEntry : RRHandler = async (input) => {
    const imageId = input.pathParams.aid ?? null;
    if (!imageId) return { status : 400, body : "Invalid asset ID" };
    const p = v.safeParse(AssetRenameRequestSchema, input.body);
    if (!p.success) return { status: 400, body: "The name has to be between 1 and 200 characters" }
    return renameAssetEntry("image", imageId, p.output.assetName);
}

const handleDeleteImageEntry : RRHandler = async (input) => {
    const imageId = input.pathParams.aid ?? null;
    if (!imageId) return { status : 400, body : "Invalid asset ID" };
    return deleteImageEntry(imageId);
}

/* Define the handler array & set up the router */

export type U44Handler = { path: string, method: string, handler: RRHandler }
export const U44_HANDLERS: U44Handler[] = [
    { path: "/api/management/v0/homescreen", method: "POST", handler: handleUpdateHomescreenConfig },
    { path: "/api/management/v0/award-info", method: "POST", handler: handleUpdateAwardInfoConfig },
    { path: "/api/management/v0/social-media-posts", method: "POST", handler: handleUpdateSocialMediaPostsConfig },
    { path : "/api/management/v0/asset", method : "GET", handler : handleListAssetEntries },
    { path : "/api/management/v0/asset", method : "POST", handler : handleCreateAssetEntry },
    { path : "/api/management/v0/asset/:tid", method : "POST", handler : handleCreateAssetUploadConfirm },
    { path : "/api/management/v0/asset/:aid", method : "PATCH", handler : handleRenameAssetEntry },
    { path : "/api/management/v0/asset/:aid", method : "DELETE", handler : handleDeleteAssetEntry },
    { path : "/api/management/v0/homescreen", method : "GET", handler : handleGetHomescreenConfigRaw },
    { path : "/api/management/v0/award-info", method : "GET", handler : handleGetAwardInfoConfigRaw },
    { path : "/api/management/v0/social-media-posts", method : "GET", handler : handleGetSocialMediaPostsConfigRaw },
    { path : "/api/management/v0/image", method : "GET", handler : handleListImageEntries },
    { path : "/api/management/v0/image", method : "POST", handler : handleCreateImageEntry },
    { path : "/api/management/v0/image/:tid", method : "POST", handler : handleCreateImageUploadConfirm },
    { path : "/api/management/v0/image/:aid", method : "PATCH", handler : handleRenameImageEntry },
    { path : "/api/management/v0/image/:aid", method : "DELETE", handler : handleDeleteImageEntry },
    { path: "/api/v0/homescreen", method: "GET", handler: handleGetHomescreenConfig },
    { path: "/api/v0/award-info", method: "GET", handler: handleGetAwardInfoConfig },
    { path: "/api/v0/social-media-posts", method: "GET", handler: handleGetSocialMediaPostsConfig },
]
const u44Router = createRouter<U44Handler>();
U44_HANDLERS.forEach(fi => addRoute(u44Router, fi.method, fi.path, fi));

/* The entry point */
export const handleRequest: RRHandler = async (input) => {
    const reqOrigin = input.headers?.origin ?? input.headers?.Origin ?? null;
    if (reqOrigin) {
        if (input.method === "OPTIONS") {
            if (ALLOWED_ORIGINS.includes(reqOrigin)) {
                return {
                    status: 204,
                    headers: { ...generateCorsHeadersPreflight(reqOrigin, ALLOWED_CORS_HEADERS, ALLOWED_CORS_METHODS, true) },
                    body: ""
                }
            }
        }
        if (!ALLOWED_ORIGINS.includes(reqOrigin)) {
            return {
                status: 403,
                headers: CORS_HEADERS_REJECTED,
                body: ""
            }
        }
    }
    const fi = findRoute(u44Router, input.method, input.path);
    if (!fi) return { status: 404, body: null };
    const res = await fi.data.handler(fi.params ? { ...input, pathParams : { ...input.pathParams, ...fi.params } } : input);
    // The frontend is served from another origin, so the actual response needs the CORS headers
    // too - a preflight alone is not enough for the browser to hand the body to the page.
    if (reqOrigin && ALLOWED_ORIGINS.includes(reqOrigin)) {
        return { ...res, headers : { ...res.headers, ...generateCorsHeadersActual(reqOrigin, true) } };
    }
    return res;
}
