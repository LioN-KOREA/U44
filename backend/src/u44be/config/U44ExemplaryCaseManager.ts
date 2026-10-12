import { getS3TextObject, putS3Object } from "../../utils/aws/S3Utils.js";
import { getAppEnv } from "../env/u44.env.js";
import * as v from 'valibot'
import { ExemplaryCasesConfig, ExemplaryCasesConfigSchema } from "../u44.schemas.js";
import { ResponseData } from "../../utils/reqres/reqres.js";

const BUCKET_NAME = getAppEnv().appS3BucketName;
const EXEMPLARY_CASES_KEY = getAppEnv().appS3Config3Key;

/** The config of a site with no exemplary cases recorded yet. */
const EMPTY_CONFIG: ExemplaryCasesConfig = {
    exemplaryCases : [],
    exemplaryCasesConfigLastUpdated : 0,
};

/*
 * No asset rewriting here, unlike the award and home screen configs.
 *
 * An exemplary case is entirely text - word pairs, headings and lead paragraphs - so there is no
 * object key to turn into a URL on the way out. That also means the public and the editor response
 * are the same thing, and the editor needs no separate "raw" endpoint of its own.
 */

/**
 * Store the config.
 *
 * The update stamp is set here rather than trusted from the request: it records when the config was
 * actually written, and a client clock has no business deciding that.
 */
export async function updateExemplaryCasesConfig(input : ExemplaryCasesConfig) : Promise<ResponseData<string>> {
    const toStore : ExemplaryCasesConfig = { ...input, exemplaryCasesConfigLastUpdated : Date.now() };
    const res = await putS3Object(EXEMPLARY_CASES_KEY, JSON.stringify(toStore), BUCKET_NAME);
    if (res.status === 200) {
        return { status : 200, body : "Request successful" }
    } else {
        return { status : res.status, body : `An error occurred while processing your request : ${res.body}` }
    }
}

export async function getExemplaryCasesConfig() : Promise<ResponseData<ExemplaryCasesConfig>> {
    try {
        const r = await getS3TextObject(EXEMPLARY_CASES_KEY, BUCKET_NAME);
        if (r.length === 0) return { status : 200, body : EMPTY_CONFIG }
        const rParsed = JSON.parse(r);
        const configParsed = v.safeParse(ExemplaryCasesConfigSchema, rParsed);
        if (!configParsed.success) {
            console.error(`The exemplary cases configuration data is malformed. Text contents : ${r} Issues during the parsing process: ${JSON.stringify(configParsed.issues)}`)
            return { status : 500, body : EMPTY_CONFIG }
        }
        return { status : 200, body : configParsed.output }
    } catch (err) {
        console.error(`An error occurred while fetching the exemplary cases config : ${err}`)
        return { status : 500, body : EMPTY_CONFIG }
    }
}
