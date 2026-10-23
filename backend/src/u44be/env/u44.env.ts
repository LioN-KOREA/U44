export type AppEnv = {
    appS3BucketName : string;
    appS3Config0Key : string;
    appS3Config1Key : string;
    appS3Config2Key : string;
    appS3Config3Key : string;
    appS3Config4Key : string;
    appS3AssetsTempPrefix : string;
    appS3AssetsImagesTempPrefix : string;
    appS3AssetsPrefix : string;
    appS3AssetsImagesPrefix : string;
    appS3AssetsThumbnailsPrefix : string;
    appDynamoDBTableName : string;
    appAllowedOriginURLs : Array<string>;
    appAssetsBaseURL : string;
    /** How long an upload URL stays valid. Short, since the client uploads right away. */
    appAssetUploadUrlValidForSec : number;
    /**
     * The account system's OIDC issuer (ex. https://accounts.lion-korea.it.kr), with no trailing
     * slash. Discovery, the JWKS and /lpx/auth/userInfo are all found under it, and it is asserted
     * as every access token's `iss`.
     */
    appOidcIssuer : string;
    /** This app's client id. Sent as client_id, and asserted as every access token's `aud`. */
    appAuthClientId : string;
    /**
     * Where the account system sends the browser back with the code. Must be byte-identical to a
     * redirect URI registered on the client - scheme, host, path and trailing slash.
     */
    appOidcRedirectURI : string;
    /** Where the browser lands after signing out. Must be registered on the client as a logout URL. */
    appOidcPostLogoutRedirectURI : string;
    /** The authority an account must hold to use the management API. */
    appManageAuthorityId : string;
}

let appEnv : AppEnv | null = null;

export function getAppEnv() : AppEnv {
    if (appEnv) return appEnv;
    appEnv = {
        appS3BucketName : process.env.U44_S3_BUCKET_NAME ?? "",
        appS3Config0Key : process.env.U44_S3_CONFIG_0_KEY ?? "configs/config0",
        appS3Config1Key : process.env.U44_S3_CONFIG_1_KEY ?? "configs/config1",
        appS3Config2Key : process.env.U44_S3_CONFIG_2_KEY ?? "configs/config2",
        appS3Config3Key : process.env.U44_S3_CONFIG_3_KEY ?? "configs/config3",
        appS3Config4Key : process.env.U44_S3_CONFIG_4_KEY ?? "configs/config4",
        appS3AssetsTempPrefix : process.env.U44_S3_ASSETS_TEMP_PREFIX ?? "tmp/assets/",
        appS3AssetsImagesTempPrefix : process.env.U44_S3_IMAGES_TEMP_PREFIX ?? "tmp/images/",
        // Not "assets/" - the frontend build shares this bucket and Vite owns that prefix.
        appS3AssetsPrefix : process.env.U44_S3_ASSETS_PREFIX ?? "uploads/files/",
        appS3AssetsImagesPrefix : process.env.U44_S3_IMAGES_PREFIX ?? "images/",
        appS3AssetsThumbnailsPrefix : process.env.U44_S3_THUMBNAILS_PREFIX ?? "images/thumbnails/",
        appDynamoDBTableName : process.env.U44_DYNAMO_DB_TABLE_NAME ?? "u44-table",
        appAllowedOriginURLs : (process.env.U44_ALLOWED_ORIGIN_URLS ?? "").split(",").map(fi => fi.trim()).filter(fi => !!fi && fi.length > 0),
        appAssetsBaseURL : process.env.U44_ASSETS_BASE_URL ?? "", // ex. https://sdfsdfsdghks.cloudfront.net
        appAssetUploadUrlValidForSec : Number(process.env.U44_ASSET_UPLOAD_URL_TTL_SEC ?? "60"),
        appOidcIssuer : (process.env.U44_OIDC_ISSUER ?? "").replace(/\/+$/, ""),
        appAuthClientId : process.env.U44_AUTH_CLIENT_ID ?? "",
        appOidcRedirectURI : process.env.U44_OIDC_REDIRECT_URI ?? "",
        appOidcPostLogoutRedirectURI : process.env.U44_OIDC_POST_LOGOUT_REDIRECT_URI ?? "",
        appManageAuthorityId : process.env.U44_MANAGE_AUTHORITY_ID ?? "",
    }
    return appEnv;
}

/** Test-only: drop the cached env so a test can change process.env and read it again. */
export function _resetAppEnv() : void {
    appEnv = null;
}
