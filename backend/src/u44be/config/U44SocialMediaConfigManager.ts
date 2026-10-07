import { getS3TextObject, putS3Object } from "../../utils/aws/S3Utils.js";
import { getAppEnv } from "../env/u44.env.js";
import * as v from 'valibot'
import { SocialMediaPostsConfig, SocialMediaPostsConfigSchema } from "../u44.schemas.js";
import { ResponseData } from "../../utils/reqres/reqres.js";
import { toAssetURL } from "../assets/U44AssetsManager.js";

const BUCKET_NAME = getAppEnv().appS3BucketName;
const SOCIAL_MEDIA_KEY = getAppEnv().appS3Config2Key;

/** The config of a site with no posts listed yet. */
const EMPTY_CONFIG: SocialMediaPostsConfig = {
    socialMediaPosts : [],
    profileURL : "",
    handle : "",
    socialMediaPostsConfigLastUpdated : 0,
};

/**
 * Turn a stored asset reference into a URL the browser can use directly.
 *
 * What is stored is an S3 object key (ex. "images/0199ab...-c3.png"); what the frontend needs is a
 * full CloudFront URL. Values that are already absolute URLs are left alone - `href` is one of
 * those, and is never rewritten: it points at the post on the social network, not at an asset.
 */
function toConfigAssetURL(value: string): string {
    if (!value) return "";
    if (/^https?:\/\//.test(value)) return value;
    return toAssetURL(value);
}

/** Rewrite the post images. The post links and the profile URL are left as they are. */
function withAssetURLs(config: SocialMediaPostsConfig): SocialMediaPostsConfig {
    return {
        ...config,
        socialMediaPosts : config.socialMediaPosts.map(post => ({
            ...post,
            image : toConfigAssetURL(post.image),
        })),
    };
}

/**
 * Store the config.
 *
 * The update stamp is set here rather than trusted from the request: it records when the config was
 * actually written, and a client clock has no business deciding that.
 */
export async function updateSocialMediaPostsConfig(input : SocialMediaPostsConfig) : Promise<ResponseData<string>> {
    const toStore : SocialMediaPostsConfig = { ...input, socialMediaPostsConfigLastUpdated : Date.now() };
    const res = await putS3Object(SOCIAL_MEDIA_KEY, JSON.stringify(toStore), BUCKET_NAME);
    if (res.status === 200) {
        return { status : 200, body : "Request successful" }
    } else {
        return { status : res.status, body : `An error occurred while processing your request : ${res.body}` }
    }
}

/**
 * The config exactly as stored, with asset keys left as keys.
 *
 * The public GET rewrites keys into CloudFront URLs, which is what the site wants but the wrong
 * thing to load into the editor: saving that back would store URLs and the keys would be lost.
 */
export async function getSocialMediaPostsConfigRaw() : Promise<ResponseData<SocialMediaPostsConfig>> {
    return readSocialMediaPostsConfig();
}

async function readSocialMediaPostsConfig() : Promise<ResponseData<SocialMediaPostsConfig>> {
    try {
        const r = await getS3TextObject(SOCIAL_MEDIA_KEY, BUCKET_NAME);
        if (r.length === 0) return { status : 200, body : EMPTY_CONFIG }
        const rParsed = JSON.parse(r);
        const configParsed = v.safeParse(SocialMediaPostsConfigSchema, rParsed);
        if (!configParsed.success) {
            console.error(`The social media configuration data is malformed. Text contents : ${r} Issues during the parsing process: ${JSON.stringify(configParsed.issues)}`)
            return { status : 500, body : EMPTY_CONFIG }
        }
        return { status : 200, body : configParsed.output }
    } catch (err) {
        console.error(`An error occurred while fetching the social media posts config : ${err}`)
        return { status : 500, body : EMPTY_CONFIG }
    }
}

export async function getSocialMediaPostsConfig() : Promise<ResponseData<SocialMediaPostsConfig>> {
    const parsed = await readSocialMediaPostsConfig();
    if (parsed.status !== 200) return parsed;
    return { status : 200, body : withAssetURLs(parsed.body) }
}
