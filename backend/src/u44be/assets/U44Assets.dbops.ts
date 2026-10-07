import type { AttributeValue } from "@aws-sdk/client-dynamodb";
import { DeleteOps, GetOps, objToDynamoDBItem, PutOps, QueryOps, UpdateOps } from "../../utils/aws/DynamoDBUtils.js";
import * as v from 'valibot'
import { getAppEnv } from "../env/u44.env.js";

export const U44AssetSchema = v.object({
    assetType : v.picklist(["file", "image"]),
    assetContentType : v.string(),
    assetName : v.string(),
    assetKey : v.string(),
    size : v.number(),
    created : v.number(),
    lastModified : v.number()
});
export type U44Asset = v.InferOutput<typeof U44AssetSchema>

const TABLE_NAME = getAppEnv().appDynamoDBTableName;

/** Every asset record shares one partition, so one query lists them all in sort-key order. */
const ASSETS_PK = "ASSETS";

/**
 * The sort key of an asset record: "IMAGE#images/0199ab...png" / "FILE#assets/0199ab...pdf".
 *
 * The trailing "#" matters for the type filter below: without it, begins_with would be matching a
 * bare prefix that a future type name could also start with.
 */
const assetSortKeyPrefix = (assetType : "image" | "file") => `${assetType === "image" ? "IMAGE" : "FILE"}#`;
const assetSortKey = (assetType : "image" | "file", assetKey : string) => `${assetSortKeyPrefix(assetType)}${assetKey}`;

/** Read one asset record out of a raw DynamoDB item, or null when it is not a usable record. */
const itemToAsset : (item : Record<string, AttributeValue> | undefined) => U44Asset | null = (item) => {
    if (!item) return null;
    // Checked for presence rather than truthiness: an empty name or a zero size is still valid data.
    const assetType = item.assetType?.S;
    if (assetType !== "image" && assetType !== "file") return null;
    if (item.assetName?.S == null || item.assetKey?.S == null || item.assetContentType?.S == null) return null;
    if (item.size?.N == null || item.created?.N == null || item.lastModified?.N == null) return null;
    return {
        assetType : assetType,
        assetName : item.assetName.S,
        assetContentType : item.assetContentType.S,
        assetKey : item.assetKey.S,
        size : Number(item.size.N),
        created : Number(item.created.N),
        lastModified : Number(item.lastModified.N)
    };
}

export const U44AssetPutOps : (input : U44Asset) => PutOps = (input) => ({
    input : {
        TableName : TABLE_NAME,
        Item : objToDynamoDBItem({...input, U44PK : ASSETS_PK, U44SK : assetSortKey(input.assetType, input.assetKey)})
    }
})

export const U44AssetGetOps : (assetType : "image" | "file", assetKey : string) => GetOps<U44Asset | null> = (assetType, assetKey) => ({
    input : {
        TableName : TABLE_NAME,
        Key : { U44PK : { S : ASSETS_PK }, U44SK : { S : assetSortKey(assetType, assetKey) } }
    },
    mapper : itemToAsset
})

export const U44AssetQueryOps : (assetType? : "image" | "file") => QueryOps<U44Asset[]> = (assetType) => ({
    input : {
        TableName : TABLE_NAME,
        KeyConditionExpression : `#pk = :pk${assetType ? " AND begins_with(#sk, :sk)" : ""}`,
        ExpressionAttributeNames : { "#pk" : "U44PK", ...(assetType && { "#sk"  : "U44SK" }) },
        ExpressionAttributeValues : { ":pk" : { S : ASSETS_PK }, ...(assetType && { ":sk"  : { S : assetSortKeyPrefix(assetType) } }) }
    },
    mapper : (items) => (items ?? []).map(itemToAsset).filter(fi => !!fi)
})

/**
 * Rename an asset. Only the label changes; the key, and therefore the stored object, stays put.
 *
 * The condition keeps this from creating a record for an asset that was deleted in the meantime -
 * an UpdateItem with no condition would happily write a brand new, half-empty item.
 */
export const U44AssetRenameOps : (assetType : "image" | "file", assetKey : string, newName : string) => UpdateOps = (assetType, assetKey, newName) => ({
    input : {
        TableName : TABLE_NAME,
        UpdateExpression : "SET #nm = :nm, #lm = :lm",
        ConditionExpression : "attribute_exists(U44SK)",
        Key : { U44PK : { S : ASSETS_PK }, U44SK : { S : assetSortKey(assetType, assetKey) } },
        ExpressionAttributeNames : { "#nm" : "assetName", "#lm" : "lastModified" },
        ExpressionAttributeValues : { ":nm" : { S : newName }, ":lm" : { N : Date.now().toString() } }
    }
})

export const U44AssetDeleteOps : (assetKey : string, assetType : "image" | "file") => DeleteOps = (key, type) => ({
    input : {
        TableName : TABLE_NAME,
        Key : { U44PK : { S : ASSETS_PK }, U44SK : { S : assetSortKey(type, key) } }
    }
})
