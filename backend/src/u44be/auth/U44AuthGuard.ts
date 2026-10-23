// Access control for the management API.
//
// Two separate questions, in this order (연동 안내서 §5 and §6):
//
//   1. Is this token genuine, and was it issued to THIS app?  -> verified locally against the
//      account system's public JWKS (U44TokenVerifier). No AWS credentials are involved.
//   2. May this account use the management API?               -> the access token does not carry
//      the authority list, so it is read from /lpx/auth/userInfo and cached briefly.
//
// A successful userInfo response is not on its own proof of anything: it says what the account may
// do, not that the token is genuine for this client. Step 1 is never skipped.

import { getAppEnv } from "../env/u44.env.js";
import { ResponseData } from "../../utils/reqres/reqres.js";
import { _resetTokenVerifier, verifyAccessToken } from "./U44TokenVerifier.js";

/** The outcome of a guard check: either the caller, or the response to send back. */
export type GuardResult =
    | { ok: true; sub: string }
    | { ok: false; response: ResponseData<string> };

/** What the account system says about one account. Only what this app uses is kept. */
export type AccountInfo = {
    authorities: string[];
    email: string;
    name: string;
};

/** Account info per `sub`, with the TTL that doubles as the authority revocation lag. */
const ACCOUNT_TTL_MS = 60_000;
const accountCache = new Map<string, { account: AccountInfo; expiresAt: number }>();

const NO_ACCOUNT: AccountInfo = { authorities: [], email: "", name: "" };

/**
 * What the account system says about one account: its authorities, and the name and email shown on
 * the management screen.
 *
 * Keyed by `sub`, the only identifier that never changes. A failed lookup is never cached: a
 * transient outage would otherwise lock everyone out for the whole TTL and look exactly like a
 * permissions problem. When the lookup fails we fall back to the last known answer if there is one,
 * and to "no authorities" if there is not.
 */
export async function lookupAccount(accessToken: string, sub: string): Promise<AccountInfo> {
    const cached = accountCache.get(sub);
    if (cached && cached.expiresAt > Date.now()) return cached.account;

    const url = `${getAppEnv().appOidcIssuer}/lpx/auth/userInfo`;
    try {
        const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (response.status !== 200) {
            console.error(`The account system answered ${response.status} for the account lookup (${sub})`);
            return cached?.account ?? NO_ACCOUNT;
        }
        const body = await response.json() as {
            data?: { authorities?: unknown; lkAccountEmail?: unknown; lkAccountName?: unknown };
        };
        const account: AccountInfo = {
            authorities: Array.isArray(body.data?.authorities)
                ? body.data.authorities.filter((item): item is string => typeof item === "string")
                : [],
            email: typeof body.data?.lkAccountEmail === "string" ? body.data.lkAccountEmail : "",
            name: typeof body.data?.lkAccountName === "string" ? body.data.lkAccountName : "",
        };
        accountCache.set(sub, { account, expiresAt: Date.now() + ACCOUNT_TTL_MS });
        return account;
    } catch (err) {
        console.error(`An error occurred while reading the account (${sub}) : ${err}`);
        return cached?.account ?? NO_ACCOUNT;
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
    if (!env.appOidcIssuer || !env.appAuthClientId || !env.appManageAuthorityId) {
        // Refusing is the only safe answer: a missing setting must never read as "allowed".
        console.error("The authentication settings are incomplete; refusing every management request.");
        return { ok: false, response: { status: 500, body: "The server is not configured for authentication" } };
    }

    const token = bearerToken(headers);
    if (!token) return { ok: false, response: { status: 401, body: "Unauthenticated" } };

    let sub: string;
    try {
        sub = (await verifyAccessToken(token)).sub;
    } catch (err) {
        // Any failure here - bad signature, wrong issuer, wrong client, expired - is a 401.
        console.error(`An access token was rejected : ${err}`);
        return { ok: false, response: { status: 401, body: "Unauthenticated" } };
    }

    const { authorities } = await lookupAccount(token, sub);
    if (!authorities.includes(env.appManageAuthorityId)) {
        return { ok: false, response: { status: 403, body: "Not permitted" } };
    }

    return { ok: true, sub };
}

/** Test-only: forget the cached key set and account info. */
export function _resetAuthGuard(): void {
    _resetTokenVerifier();
    accountCache.clear();
}

/**
 * Test-only: age every cached entry out without discarding it.
 *
 * Expiring is not the same as clearing: an expired entry is still the last known answer, which is
 * what a failed lookup falls back to. Clearing would hide exactly the behaviour worth testing.
 */
export function _expireAuthorityCache(): void {
    for (const entry of accountCache.values()) entry.expiresAt = 0;
}
