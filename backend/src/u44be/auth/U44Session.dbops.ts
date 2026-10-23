import type { AttributeValue } from "@aws-sdk/client-dynamodb";
import { DeleteOps, GetOps, objToDynamoDBItem, PutOps, UpdateOps } from "../../utils/aws/DynamoDBUtils.js";
import { getAppEnv } from "../env/u44.env.js";

/*
 * A signed-in browser's session: what the backend holds so that the refresh token never reaches the
 * browser (연동 안내서 §2, "왜 /token 은 백엔드에서 부르는가").
 *
 * The browser holds only a random session id, in an HttpOnly cookie. The record is keyed by the
 * SHA-256 of that id rather than the id itself, so a read of the table does not hand out working
 * session cookies.
 */
export type U44Session = {
    sub : string;
    /** Rotated on every refresh; the one stored here is always the newest. */
    refreshToken : string;
    /** The newest access token, shared by every tab of this session. */
    accessToken : string;
    /** When accessToken expires, in milliseconds. */
    accessExpiresAt : number;
    created : number;
    /**
     * A refresh in progress holds this lease until the given time (ms). Refreshes must be serialised
     * per session - replaying a rotated-away refresh token is treated as theft and ends the whole
     * session (§4.3) - and two tabs, or two Lambda containers, can ask at once.
     */
    lockUntil : number;
};

const TABLE_NAME = getAppEnv().appDynamoDBTableName;

const sessionKey = (sessionHash : string) => ({
    U44PK : { S : `SESSION#${sessionHash}` },
    U44SK : { S : "SESSION" },
});

const itemToSession : (item : Record<string, AttributeValue> | undefined) => U44Session | null = (item) => {
    if (!item) return null;
    if (item.sub?.S == null || item.refreshToken?.S == null || item.accessToken?.S == null) return null;
    if (item.accessExpiresAt?.N == null || item.created?.N == null) return null;
    return {
        sub : item.sub.S,
        refreshToken : item.refreshToken.S,
        accessToken : item.accessToken.S,
        accessExpiresAt : Number(item.accessExpiresAt.N),
        created : Number(item.created.N),
        lockUntil : Number(item.lockUntil?.N ?? "0"),
    };
}

/**
 * Store a new session.
 *
 * U44TTL is the table's TTL attribute (seconds): DynamoDB removes the record once the refresh token
 * it holds can no longer be used anyway.
 */
export const U44SessionPutOps : (sessionHash : string, session : U44Session, expiresAtMs : number) => PutOps = (sessionHash, session, expiresAtMs) => ({
    input : {
        TableName : TABLE_NAME,
        Item : {
            ...objToDynamoDBItem({ ...session }),
            ...sessionKey(sessionHash),
            U44TTL : { N : Math.ceil(expiresAtMs / 1000).toString() },
        },
    }
})

export const U44SessionGetOps : (sessionHash : string) => GetOps<U44Session | null> = (sessionHash) => ({
    input : {
        TableName : TABLE_NAME,
        Key : sessionKey(sessionHash),
        // A refresh decides whether to rotate from what it reads here; a stale read could rotate a
        // token another container has just rotated away.
        ConsistentRead : true,
    },
    mapper : itemToSession,
})

/**
 * Take the refresh lease. Fails (ConditionalCheckFailedException) while another refresh holds it,
 * or when the session no longer exists.
 */
export const U44SessionLockOps : (sessionHash : string, now : number, until : number) => UpdateOps = (sessionHash, now, until) => ({
    input : {
        TableName : TABLE_NAME,
        Key : sessionKey(sessionHash),
        UpdateExpression : "SET #lk = :until",
        ConditionExpression : "attribute_exists(U44SK) AND (attribute_not_exists(#lk) OR #lk < :now)",
        ExpressionAttributeNames : { "#lk" : "lockUntil" },
        ExpressionAttributeValues : { ":until" : { N : until.toString() }, ":now" : { N : now.toString() } },
    }
})

/** Store a rotated token pair and release the lease, in one write. */
export const U44SessionRotateOps : (sessionHash : string, refreshToken : string, accessToken : string, accessExpiresAt : number) => UpdateOps = (sessionHash, refreshToken, accessToken, accessExpiresAt) => ({
    input : {
        TableName : TABLE_NAME,
        Key : sessionKey(sessionHash),
        UpdateExpression : "SET #rt = :rt, #at = :at, #ae = :ae, #lk = :zero",
        ConditionExpression : "attribute_exists(U44SK)",
        ExpressionAttributeNames : { "#rt" : "refreshToken", "#at" : "accessToken", "#ae" : "accessExpiresAt", "#lk" : "lockUntil" },
        ExpressionAttributeValues : {
            ":rt" : { S : refreshToken },
            ":at" : { S : accessToken },
            ":ae" : { N : accessExpiresAt.toString() },
            ":zero" : { N : "0" },
        },
    }
})

/** Give the lease back without rotating (the refresh failed, or turned out to be unnecessary). */
export const U44SessionUnlockOps : (sessionHash : string) => UpdateOps = (sessionHash) => ({
    input : {
        TableName : TABLE_NAME,
        Key : sessionKey(sessionHash),
        UpdateExpression : "SET #lk = :zero",
        ConditionExpression : "attribute_exists(U44SK)",
        ExpressionAttributeNames : { "#lk" : "lockUntil" },
        ExpressionAttributeValues : { ":zero" : { N : "0" } },
    }
})

export const U44SessionDeleteOps : (sessionHash : string) => DeleteOps = (sessionHash) => ({
    input : {
        TableName : TABLE_NAME,
        Key : sessionKey(sessionHash),
    }
})
