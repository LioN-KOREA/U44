// Access control for the management API.
//
// Two separate questions, in this order (reference.md, "Setting your app so that only those with
// the appropriate authority can access the app"):
//
//   1. Is this token genuine, and was it issued to THIS app?  -> verified locally against the
//      pool's public JWKS. No call leaves the Lambda, and no AWS credentials are involved.
//   2. May this account use the management API?               -> the access token does not carry
//      the authority list, so it is read from /lpx/auth/userInfo and cached briefly.
//
// A successful userInfo response is not on its own proof of anything: it says what the account may
// do, not that the token is genuine for this client. Step 1 is never skipped.

import { CognitoJwtVerifier } from "aws-jwt-verify";
import { getAppEnv } from "../env/u44.env.js";
import { ResponseData } from "../../utils/reqres/reqres.js";

/** The outcome of a guard check: either the caller, or the response to send back. */
export type GuardResult =
    | { ok: true; sub: string }
    | { ok: false; response: ResponseData<string> };

/**
 * The verifier is built once and reused.
 *
 * It fetches and caches the JWKS itself, so building it per request would re-download the key
 * document on every call.
 */
let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

function getVerifier() {
    if (!verifier) {
        const env = getAppEnv();
        verifier = CognitoJwtVerifier.create({
            userPoolId: env.appAuthUserPoolId,
            // Asserting both of these is the point: an id token, or an access token minted for a
            // different app client, must not open this API.
            tokenUse: "access",
            clientId: env.appAuthClientId,
        });
    }
    return verifier;
}

/** Authorities per account, with the TTL that doubles as the revocation lag. */
const AUTHORITY_TTL_MS = 60_000;
const authorityCache = new Map<string, { authorities: string[]; expiresAt: number }>();

/**
 * The authority list for one account.
 *
 * A failed lookup is never cached: a transient outage would otherwise lock everyone out for the
 * whole TTL and look exactly like a permissions problem. When the lookup fails we fall back to the
 * last known answer if there is one, and to "no authorities" if there is not.
 */
async function authoritiesFor(accessToken: string, sub: string): Promise<string[]> {
    const cached = authorityCache.get(sub);
    if (cached && cached.expiresAt > Date.now()) return cached.authorities;

    const env = getAppEnv();
    const url = `${env.appAuthBaseURL}/lpx/auth/userInfo?clientId=${encodeURIComponent(env.appAuthClientId)}`;
    try {
        const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (response.status !== 200) {
            console.error(`The account system answered ${response.status} for the authority lookup (${sub})`);
            return cached?.authorities ?? [];
        }
        const body = await response.json() as { data?: { authorities?: unknown } };
        const authorities = Array.isArray(body.data?.authorities)
            ? body.data.authorities.filter((item): item is string => typeof item === "string")
            : [];
        authorityCache.set(sub, { authorities, expiresAt: Date.now() + AUTHORITY_TTL_MS });
        return authorities;
    } catch (err) {
        console.error(`An error occurred while reading the authorities (${sub}) : ${err}`);
        return cached?.authorities ?? [];
    }
}

/** Pull the bearer token out of the request headers, whatever case they arrived in. */
function bearerToken(headers: Record<string, string> | undefined): string | null {
    const raw = headers?.authorization ?? headers?.Authorization ?? null;
    if (!raw) return null;
    const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
    return match ? match[1]!.trim() : null;
}

/**
 * Let the request through only for a verified account holding the management authority.
 *
 * Returns the response to send on refusal rather than throwing, so the caller stays a plain
 * handler: 401 when we cannot tell who this is, 403 when we can but they may not.
 */
export async function requireManageAuthority(headers: Record<string, string> | undefined): Promise<GuardResult> {
    const env = getAppEnv();
    if (!env.appAuthUserPoolId || !env.appAuthClientId || !env.appManageAuthorityId) {
        // Refusing is the only safe answer: a missing setting must never read as "allowed".
        console.error("The authentication settings are incomplete; refusing every management request.");
        return { ok: false, response: { status: 500, body: "The server is not configured for authentication" } };
    }

    const token = bearerToken(headers);
    if (!token) return { ok: false, response: { status: 401, body: "Unauthenticated" } };

    let sub: string;
    try {
        const claims = await getVerifier().verify(token);
        sub = claims.sub;
    } catch (err) {
        // Any failure here - bad signature, wrong issuer, wrong client, expired - is a 401.
        console.error(`An access token was rejected : ${err}`);
        return { ok: false, response: { status: 401, body: "Unauthenticated" } };
    }

    const authorities = await authoritiesFor(token, sub);
    if (!authorities.includes(env.appManageAuthorityId)) {
        return { ok: false, response: { status: 403, body: "Not permitted" } };
    }

    return { ok: true, sub };
}

/** Test-only: forget the cached verifier and authorities. */
export function _resetAuthGuard(): void {
    verifier = null;
    authorityCache.clear();
}

/**
 * Test-only: age every cached entry out without discarding it.
 *
 * Expiring is not the same as clearing: an expired entry is still the last known answer, which is
 * what a failed lookup falls back to. Clearing would hide exactly the behaviour worth testing.
 */
export function _expireAuthorityCache(): void {
    for (const entry of authorityCache.values()) entry.expiresAt = 0;
}
