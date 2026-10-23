// Is this access token genuine, and was it issued to THIS app?
//
// Verified locally against the account system's public JWKS - no call leaves the Lambda per request
// beyond the occasional key download. Every check the integration guide (§5) lists is asserted here:
//
//   - the signature, with the key chosen by the token header's `kid` (two keys are always published
//     and the signing one rotates yearly; taking the first key works until the day it does not);
//   - `alg` pinned to RS256, so the token cannot pick its own algorithm (or `none`);
//   - `iss` exactly the issuer, `aud` this app's client id - without the audience check, a token
//     issued to a different registered client would open this API;
//   - `token_use === "access"`, so an id token is refused;
//   - expiry, with the same 60s leeway the account system allows itself.

import * as jose from "jose";
import { getAppEnv } from "../env/u44.env.js";

export type VerifiedAccessToken = {
    sub : string;
    /** Expiry, in milliseconds. */
    expiresAt : number;
};

/** How long the key document is kept before it is fetched again (the guide asks for 5 minutes). */
const JWKS_CACHE_MS = 300_000;
const CLOCK_TOLERANCE_SEC = 60;

/*
 * Built once per container and reused: it caches the key document, and refetches it - once, with a
 * cooldown - when a token names a `kid` it has not seen. Building it per request would download the
 * keys on every call.
 */
let jwks : ReturnType<typeof jose.createRemoteJWKSet> | null = null;

function keySet() {
    if (!jwks) {
        jwks = jose.createRemoteJWKSet(
            new URL(`${getAppEnv().appOidcIssuer}/.well-known/jwks.json`),
            { cacheMaxAge : JWKS_CACHE_MS },
        );
    }
    return jwks;
}

/**
 * Verify an access token. Throws on anything short of a valid access token for this app.
 */
export async function verifyAccessToken(token : string) : Promise<VerifiedAccessToken> {
    const env = getAppEnv();
    const { payload } = await jose.jwtVerify(token, keySet(), {
        issuer : env.appOidcIssuer,
        audience : env.appAuthClientId,
        algorithms : ["RS256"],
        clockTolerance : CLOCK_TOLERANCE_SEC,
        requiredClaims : ["sub", "exp"],
    });
    if (payload.token_use !== "access") throw new Error("Not an access token");
    if (typeof payload.sub !== "string" || payload.sub === "") throw new Error("The token names no account");
    return { sub : payload.sub, expiresAt : (payload.exp ?? 0) * 1000 };
}

/** Test-only: forget the cached key set. */
export function _resetTokenVerifier() : void {
    jwks = null;
}
