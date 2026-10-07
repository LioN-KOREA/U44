import { getS3TextObject, putS3Object } from "../../utils/aws/S3Utils.js";
import { getAppEnv } from "../env/u44.env.js";
import * as v from 'valibot'
import { AwardInfo, AwardInfoConfig, AwardInfoConfigSchema, PendingAwardInfo } from "../u44.schemas.js";
import { ResponseData } from "../../utils/reqres/reqres.js";
import { toAssetURL } from "../assets/U44AssetsManager.js";

const BUCKET_NAME = getAppEnv().appS3BucketName;
const AWARD_INFO_KEY = getAppEnv().appS3Config1Key;

/** The config of a site that has no ceremonies recorded yet. */
const EMPTY_CONFIG: AwardInfoConfig = {
    awardCeremonies : [],
    awardCeremoniesPending : [],
    awardInfoConfigLastUpdated : 0,
};

/**
 * Turn a stored asset reference into a URL the browser can use directly.
 *
 * What is stored is an S3 object key (what the upload confirm step returns, ex.
 * "images/0199ab...-c3.png"). What the frontend needs is a full CloudFront URL, so the mapping
 * happens here on the way out rather than in the browser. A value that is already an absolute URL
 * is left alone, so an image hosted somewhere else can still be referenced.
 */
function toConfigAssetURL(value: string): string {
    if (!value) return "";
    if (/^https?:\/\//.test(value)) return value;
    return toAssetURL(value);
}

/** A ceremony that has been held is the only shape that carries asset references. */
function isCompletedAwardInfo(entry: AwardInfo | PendingAwardInfo): entry is AwardInfo {
    return entry.isAwardCeremonyComplete;
}

/** Rewrite every asset reference of one held ceremony into an absolute URL. */
function ceremonyWithAssetURLs(entry: AwardInfo): AwardInfo {
    return {
        ...entry,
        awardRepresentativePicture: toConfigAssetURL(entry.awardRepresentativePicture),
        awardWinners: entry.awardWinners.map(section => ({
            ...section,
            winners: section.winners.map(winner => ({
                ...winner,
                image: toConfigAssetURL(winner.image),
            })),
        })),
        awardCeremonyPictures: entry.awardCeremonyPictures.map(picture => ({
            thumbnail: toConfigAssetURL(picture.thumbnail),
            picture: toConfigAssetURL(picture.picture),
        })),
    };
}

/**
 * Rewrite every asset reference in the config.
 *
 * Pending ceremonies hold no assets, so only the held ones and - when it has been held - the award
 * of the year need rewriting.
 */
function withAssetURLs(config: AwardInfoConfig): AwardInfoConfig {
    const ofTheYear = config.awardCeremonyOfTheYear;
    return {
        ...config,
        awardCeremonies: config.awardCeremonies.map(ceremonyWithAssetURLs),
        ...(ofTheYear && {
            awardCeremonyOfTheYear: isCompletedAwardInfo(ofTheYear) ? ceremonyWithAssetURLs(ofTheYear) : ofTheYear,
        }),
    };
}

/**
 * Store the config.
 *
 * The update stamp is set here rather than trusted from the request: it records when the config was
 * actually written, and a client clock has no business deciding that.
 */
export async function updateAwardInfoConfig(input : AwardInfoConfig) : Promise<ResponseData<string>> {
    const toStore : AwardInfoConfig = { ...input, awardInfoConfigLastUpdated : Date.now() };
    const res = await putS3Object(AWARD_INFO_KEY, JSON.stringify(toStore), BUCKET_NAME);
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
 * thing to load into the editor: saving that back would store URLs instead of keys. The management
 * UI therefore reads this one, edits it, and posts the same shape back.
 */
export async function getAwardInfoConfigRaw() : Promise<ResponseData<AwardInfoConfig>> {
    const parsed = await readAwardInfoConfig();
    return parsed;
}

async function readAwardInfoConfig() : Promise<ResponseData<AwardInfoConfig>> {
    try {
        const r = await getS3TextObject(AWARD_INFO_KEY, BUCKET_NAME);
        if (r.length === 0) return { status : 200, body : EMPTY_CONFIG }
        const rParsed = JSON.parse(r);
        const configParsed = v.safeParse(AwardInfoConfigSchema, rParsed);
        if (!configParsed.success) {
            console.error(`The configuration data is malformed. Text contents : ${r} Issues during the parsing process: ${JSON.stringify(configParsed.issues)}`)
            return { status : 500, body : EMPTY_CONFIG }
        }
        return { status : 200, body : configParsed.output }
    } catch (err) {
        console.error(`An error occurred while fetching the award info config : ${err}`)
        return { status : 500, body : EMPTY_CONFIG }
    }
}

export async function getAwardInfoConfig() : Promise<ResponseData<AwardInfoConfig>> {
    const parsed = await readAwardInfoConfig();
    if (parsed.status !== 200) return parsed;
    return { status : 200, body : withAssetURLs(parsed.body) }
}
