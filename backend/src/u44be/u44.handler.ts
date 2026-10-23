import { addRoute, createRouter, findRoute } from "rou3";
import { ResponseData, RRHandler } from "../utils/reqres/reqres.js";
import { getAwardInfoConfig, getAwardInfoConfigRaw, updateAwardInfoConfig } from "./config/U44AwardConfigManager.js";
import * as v from 'valibot'
import {
    AssetConfirmRequestSchema,
    AssetEntryCreationRequestSchema,
    AssetRenameRequestSchema,
    AwardInfoConfigSchema,
    ExemplaryCasesConfigSchema,
    HomescreenConfigSchema,
    RecommendedGlossaryConfigSchema,
    SocialMediaPostsConfigSchema,
} from "./u44.schemas.js";
import { getExemplaryCasesConfig, updateExemplaryCasesConfig } from "./config/U44ExemplaryCaseManager.js";
import { getGlossaryConfig, updateGlossaryConfig } from "./config/U44GlossaryManager.js";
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
import { requireManageAuthority } from "./auth/U44AuthGuard.js";
import { completeLogin, endSession, refreshSession, startLogin } from "./auth/U44SessionManager.js";

const ALLOWED_ORIGINS = getAppEnv().appAllowedOriginURLs;

const ALLOWED_CORS_HEADERS = ["Authorization", "Content-Type"];
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

/*
 * 우리말 우수사례 (config3) 와 우리말 개선 용어 (config4).
 *
 * 둘 다 글과 낱말 짝뿐이라 바꿔 줄 자산 주소가 없습니다. 그래서 공개용과 편집용 응답이 같고,
 * 편집용 엔드포인트를 따로 두지 않았습니다 - 시상식·홈 화면과 다른 점입니다.
 */
const handleGetExemplaryCasesConfig: RRHandler = async () => {
    return getExemplaryCasesConfig();
}

const handleUpdateExemplaryCasesConfig: RRHandler = async (input) => {
    const p = v.safeParse(ExemplaryCasesConfigSchema, input.body);
    if (!p.success) return { status: 400, body: `An error occurred while validating the request: ${p.issues}` }
    return updateExemplaryCasesConfig(p.output);
}

const handleGetGlossaryConfig: RRHandler = async () => {
    return getGlossaryConfig();
}

/*
 * 용어집은 브라우저가 XLSX·CSV 를 읽어 낱말 짝으로 바꾼 뒤 통째로 보냅니다.
 * 수천 줄이라도 JSON 으로는 수백 KB 라, 프리사인 업로드까지 갈 일이 아닙니다.
 */
const handleUpdateGlossaryConfig: RRHandler = async (input) => {
    const p = v.safeParse(RecommendedGlossaryConfigSchema, input.body);
    if (!p.success) return { status: 400, body: `An error occurred while validating the request: ${p.issues}` }
    return updateGlossaryConfig(p.output);
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

/*
 * Signing in and out (U44SessionManager). Open to everyone, like the public reads: they are how a
 * browser gets a token in the first place, and each checks its own cookie.
 */
const handleLogin: RRHandler = async () => startLogin();
const handleCompleteLogin: RRHandler = async (input) => completeLogin(input);
const handleRefreshSession: RRHandler = async (input) => refreshSession(input);
const handleLogout: RRHandler = async (input) => endSession(input);

/** Everything under here is management, and is gated on the authority. */
const MANAGEMENT_PATH_PREFIX = "/api/management/";

/* Define the handler array & set up the router */

export type U44Handler = { path: string, method: string, handler: RRHandler }
export const U44_HANDLERS: U44Handler[] = [
    { path: "/api/management/v0/homescreen", method: "POST", handler: handleUpdateHomescreenConfig },
    { path: "/api/management/v0/award-info", method: "POST", handler: handleUpdateAwardInfoConfig },
    { path: "/api/management/v0/social-media-posts", method: "POST", handler: handleUpdateSocialMediaPostsConfig },
    { path: "/api/management/v0/exemplary-cases", method: "POST", handler: handleUpdateExemplaryCasesConfig },
    { path: "/api/management/v0/glossary", method: "POST", handler: handleUpdateGlossaryConfig },
    { path : "/api/management/v0/asset", method : "GET", handler : handleListAssetEntries },
    { path : "/api/management/v0/asset", method : "POST", handler : handleCreateAssetEntry },
    { path : "/api/management/v0/asset/:tid", method : "POST", handler : handleCreateAssetUploadConfirm },
    { path : "/api/management/v0/asset/:aid", method : "PATCH", handler : handleRenameAssetEntry },
    { path : "/api/management/v0/asset/:aid", method : "DELETE", handler : handleDeleteAssetEntry },
    { path : "/api/management/v0/homescreen", method : "GET", handler : handleGetHomescreenConfigRaw },
    { path : "/api/management/v0/award-info", method : "GET", handler : handleGetAwardInfoConfigRaw },
    { path : "/api/management/v0/social-media-posts", method : "GET", handler : handleGetSocialMediaPostsConfigRaw },
    { path : "/api/management/v0/exemplary-cases", method : "GET", handler : handleGetExemplaryCasesConfig },
    { path : "/api/management/v0/glossary", method : "GET", handler : handleGetGlossaryConfig },
    { path : "/api/management/v0/image", method : "GET", handler : handleListImageEntries },
    { path : "/api/management/v0/image", method : "POST", handler : handleCreateImageEntry },
    { path : "/api/management/v0/image/:tid", method : "POST", handler : handleCreateImageUploadConfirm },
    { path : "/api/management/v0/image/:aid", method : "PATCH", handler : handleRenameImageEntry },
    { path : "/api/management/v0/image/:aid", method : "DELETE", handler : handleDeleteImageEntry },
    { path: "/api/v0/homescreen", method: "GET", handler: handleGetHomescreenConfig },
    { path: "/api/v0/award-info", method: "GET", handler: handleGetAwardInfoConfig },
    { path: "/api/v0/social-media-posts", method: "GET", handler: handleGetSocialMediaPostsConfig },
    { path: "/api/v0/exemplary-cases", method: "GET", handler: handleGetExemplaryCasesConfig },
    { path: "/api/v0/glossary", method: "GET", handler: handleGetGlossaryConfig },
    { path: "/api/auth/login", method: "GET", handler: handleLogin },
    { path: "/api/auth/session", method: "POST", handler: handleCompleteLogin },
    { path: "/api/auth/refresh", method: "POST", handler: handleRefreshSession },
    { path: "/api/auth/logout", method: "POST", handler: handleLogout },
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
    // The frontend is served from another origin, so every answer needs the CORS headers - a
    // preflight alone is not enough for the browser to hand the body to the page. That includes
    // the guard's refusals, or the UI could not tell 401 from a network failure.
    const withCors = (res: ResponseData<unknown>): ResponseData<unknown> =>
        reqOrigin && ALLOWED_ORIGINS.includes(reqOrigin)
            ? { ...res, headers : { ...res.headers, ...generateCorsHeadersActual(reqOrigin, true) } }
            : res;

    const fi = findRoute(u44Router, input.method, input.path);
    if (!fi) return withCors({ status: 404, body: null });

    /*
     * Everything under /api/management needs a signed-in account holding the management authority.
     *
     * Checked here, on the path, rather than inside each handler: a route added later is covered
     * without anyone having to remember to wrap it. The public /api/v0 reads stay open.
     */
    if (input.path.startsWith(MANAGEMENT_PATH_PREFIX)) {
        const guard = await requireManageAuthority(input.headers);
        if (!guard.ok) return withCors(guard.response);
    }

    const res = await fi.data.handler(fi.params ? { ...input, pathParams : { ...input.pathParams, ...fi.params } } : input);
    return withCors(res);
}
