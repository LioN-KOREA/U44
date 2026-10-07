import { getS3TextObject, putS3Object } from "../../utils/aws/S3Utils.js";
import { getAppEnv } from "../env/u44.env.js";
import * as v from 'valibot'
import { HomescreenConfig, HomescreenConfigSchema } from "../u44.schemas.js";
import { ResponseData } from "../../utils/reqres/reqres.js";
import { toAssetURL } from "../assets/U44AssetsManager.js";

const BUCKET_NAME = getAppEnv().appS3BucketName;
const HOMESCREEN_KEY = getAppEnv().appS3Config0Key;

/**
 * What the site is served when the stored config says nothing.
 *
 * Unlike the other configs, an empty homescreen leaves a hole in the middle of the landing page and
 * an odd half-sentence where the contact line goes, so this one never answers with nothing.
 *
 * default-main.png ships with the frontend (public/default-main.png) rather than living in the
 * bucket, so it is served from the site's own origin and keeps working even if the bucket is empty -
 * which is exactly the case this is here for.
 *
 * The frontend keeps the same values for when the API itself cannot be reached
 * (src/data/homescreen.ts, HOMESCREEN_DEFAULT). Keep the two in step.
 */
const HOMESCREEN_DEFAULTS = {
    mainBannerImage : "/default-main.png",
    mainBannerAltText : "Main poster image",
    contactEmailAddr : "kplain.urimal@gmail.com",
    businessHours : "09:00 - 18:00",
} as const;

/** The config of a site that has not been set up yet: nothing chosen, nothing stored. */
const EMPTY_CONFIG: HomescreenConfig = {
    mainBannerImage : "",
    mainBannerAltText : "",
    contactEmailAddr : "",
    businessHours : "",
    homescreenConfigLastUpdated : 0,
};

/**
 * Turn a stored asset reference into a URL the browser can use directly.
 *
 * What is stored is an S3 object key (ex. "images/0199ab...-c3.png"); what the frontend needs is a
 * full CloudFront URL. A value that is already an absolute URL, or a path rooted at the site itself
 * (the default banner), is left alone.
 */
function toConfigAssetURL(value: string): string {
    if (!value) return "";
    if (/^https?:\/\//.test(value)) return value;
    if (value.startsWith("/")) return value;
    return toAssetURL(value);
}

/**
 * Fill in every field the config leaves empty.
 *
 * Applied on the way out only, so the stored config keeps saying "nothing chosen" and the management
 * UI shows empty inputs rather than defaults it did not set - saving those back would freeze the
 * fallback into a real choice.
 */
function withDefaults(config: HomescreenConfig): HomescreenConfig {
    const chosenBanner = config.mainBannerImage !== "";
    return {
        ...config,
        mainBannerImage : chosenBanner
            ? toConfigAssetURL(config.mainBannerImage)
            : HOMESCREEN_DEFAULTS.mainBannerImage,
        /*
         * The alt text falls back together with the banner rather than on its own: text written to
         * describe a chosen banner would be wrong on the default one.
         */
        mainBannerAltText : chosenBanner
            ? (config.mainBannerAltText || HOMESCREEN_DEFAULTS.mainBannerAltText)
            : HOMESCREEN_DEFAULTS.mainBannerAltText,
        contactEmailAddr : config.contactEmailAddr || HOMESCREEN_DEFAULTS.contactEmailAddr,
        businessHours : config.businessHours || HOMESCREEN_DEFAULTS.businessHours,
    };
}

/**
 * Store the config.
 *
 * The update stamp is set here rather than trusted from the request: it records when the config was
 * actually written, and a client clock has no business deciding that.
 */
export async function updateHomescreenConfig(input : HomescreenConfig) : Promise<ResponseData<string>> {
    const toStore : HomescreenConfig = { ...input, homescreenConfigLastUpdated : Date.now() };
    const res = await putS3Object(HOMESCREEN_KEY, JSON.stringify(toStore), BUCKET_NAME);
    if (res.status === 200) {
        return { status : 200, body : "Request successful" }
    } else {
        return { status : res.status, body : `An error occurred while processing your request : ${res.body}` }
    }
}

/**
 * The config exactly as stored, with asset keys left as keys and no default filled in.
 *
 * The public GET rewrites keys into CloudFront URLs and substitutes the default banner, which is
 * what the site wants but the wrong thing to load into the editor: saving that back would store a
 * URL instead of a key, and would turn "no banner chosen" into a real choice.
 */
export async function getHomescreenConfigRaw() : Promise<ResponseData<HomescreenConfig>> {
    return readHomescreenConfig();
}

async function readHomescreenConfig() : Promise<ResponseData<HomescreenConfig>> {
    try {
        const r = await getS3TextObject(HOMESCREEN_KEY, BUCKET_NAME);
        if (r.length === 0) return { status : 200, body : EMPTY_CONFIG }
        const rParsed = JSON.parse(r);
        const configParsed = v.safeParse(HomescreenConfigSchema, rParsed);
        if (!configParsed.success) {
            console.error(`The homescreen configuration data is malformed. Text contents : ${r} Issues during the parsing process: ${JSON.stringify(configParsed.issues)}`)
            return { status : 500, body : EMPTY_CONFIG }
        }
        return { status : 200, body : configParsed.output }
    } catch (err) {
        console.error(`An error occurred while fetching the homescreen config : ${err}`)
        return { status : 500, body : EMPTY_CONFIG }
    }
}

/**
 * The config for the site.
 *
 * Even a read that failed answers with the default banner: a broken or missing config should leave
 * the landing page looking ordinary rather than leaving a gap where the banner belongs.
 */
export async function getHomescreenConfig() : Promise<ResponseData<HomescreenConfig>> {
    const parsed = await readHomescreenConfig();
    return { status : 200, body : withDefaults(parsed.body) }
}
