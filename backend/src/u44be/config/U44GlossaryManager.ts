import { getS3TextObject, putS3Object } from "../../utils/aws/S3Utils.js";
import { getAppEnv } from "../env/u44.env.js";
import * as v from 'valibot'
import { RecommendedGlossaryConfig, RecommendedGlossaryConfigSchema } from "../u44.schemas.js";
import { ResponseData } from "../../utils/reqres/reqres.js";

const BUCKET_NAME = getAppEnv().appS3BucketName;
const GLOSSARY_KEY = getAppEnv().appS3Config4Key;

/** The config of a site with no glossary loaded yet. */
const EMPTY_CONFIG: RecommendedGlossaryConfig = {
    lastUpdatedAt : 0,
    glossary : [],
};

/*
 * The glossary arrives as JSON, already parsed.
 *
 * The admin uploads an XLSX or CSV, but the browser turns it into word pairs before posting - so
 * nothing here deals with spreadsheets. That keeps a parser (and its dependencies) out of the
 * Lambda, and keeps the upload to a single request instead of the presign/upload/confirm round
 * trip that a binary file would need. The whole list is well under a megabyte of JSON.
 */

/**
 * Store the glossary.
 *
 * The update stamp is set here rather than trusted from the request: it records when the glossary
 * was actually written, and a client clock has no business deciding that.
 */
export async function updateGlossaryConfig(input : RecommendedGlossaryConfig) : Promise<ResponseData<string>> {
    const toStore : RecommendedGlossaryConfig = { ...input, lastUpdatedAt : Date.now() };
    const res = await putS3Object(GLOSSARY_KEY, JSON.stringify(toStore), BUCKET_NAME);
    if (res.status === 200) {
        return { status : 200, body : "Request successful" }
    } else {
        return { status : res.status, body : `An error occurred while processing your request : ${res.body}` }
    }
}

export async function getGlossaryConfig() : Promise<ResponseData<RecommendedGlossaryConfig>> {
    try {
        const r = await getS3TextObject(GLOSSARY_KEY, BUCKET_NAME);
        if (r.length === 0) return { status : 200, body : EMPTY_CONFIG }
        const rParsed = JSON.parse(r);
        const configParsed = v.safeParse(RecommendedGlossaryConfigSchema, rParsed);
        if (!configParsed.success) {
            console.error(`The glossary configuration data is malformed. Issues during the parsing process: ${JSON.stringify(configParsed.issues)}`)
            return { status : 500, body : EMPTY_CONFIG }
        }
        return { status : 200, body : configParsed.output }
    } catch (err) {
        console.error(`An error occurred while fetching the glossary config : ${err}`)
        return { status : 500, body : EMPTY_CONFIG }
    }
}
