// Stand-ins for the two things the guard depends on: the JWT verifier and the account system.
//
// The verifier is replaced here so these suites can use plain strings as tokens. What is exercised
// is everything around it: that a missing or rejected token is a 401, that the authority list
// decides 403 vs 200, that the answer is cached, and that a failed lookup is not. The verifier
// itself is tested with real signed tokens in u44.oidc.test.ts.

/** The account system's issuer in tests. */
export const AUTH_BASE = "https://auth.example.test";
export const CLIENT_ID = "test-client-id";
export const MANAGE_AUTHORITY = "519093fd-d789-4853-b117-45187186ccb3";

/** Tokens the fake verifier accepts, and the `sub` each one belongs to. */
export const validTokens = new Map<string, string>();
/** Authorities per `sub`, as the account system would report them. */
export const authoritiesBySub = new Map<string, string[]>();
/** Subs whose userInfo lookup should fail, and with what status (0 = network error). */
export const failingLookups = new Map<string, number>();

export const verifyCalls: string[] = [];
export const userInfoCalls: string[] = [];

/** A signed-in account holding the management authority. */
export function anAdmin(token = "admin-token", sub = "sub-admin"): string {
    validTokens.set(token, sub);
    authoritiesBySub.set(sub, [MANAGE_AUTHORITY, "some-other-authority"]);
    return token;
}

/** A signed-in account that may not manage anything. */
export function aPlainUser(token = "user-token", sub = "sub-user"): string {
    validTokens.set(token, sub);
    authoritiesBySub.set(sub, ["some-other-authority"]);
    return token;
}

export function authHeaders(token: string): Record<string, string> {
    return { authorization: `Bearer ${token}` };
}

export function resetFakeAuth(): void {
    validTokens.clear();
    authoritiesBySub.clear();
    failingLookups.clear();
    verifyCalls.length = 0;
    userInfoCalls.length = 0;
}

/** The module factory for `vi.mock("../src/u44be/auth/U44TokenVerifier.js", ...)`. */
export function fakeTokenVerifierModule() {
    return {
        verifyAccessToken: async (token: string) => {
            verifyCalls.push(token);
            const sub = validTokens.get(token);
            if (!sub) throw new Error("Invalid token");
            return { sub, expiresAt: Date.now() + 300_000 };
        },
        _resetTokenVerifier: () => undefined,
    };
}

/**
 * Stands in for the account system's `/lpx/auth/userInfo`.
 *
 * Install it over `globalThis.fetch`. Anything that is not a userInfo call is handed to the
 * original fetch, so a test that also mocks other HTTP calls keeps working.
 */
export function installFakeUserInfo(): () => void {
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = typeof input === "string" ? input : input.toString();
        if (!url.includes("/lpx/auth/userInfo")) {
            return original ? original(input, init) : Promise.reject(new Error(`unexpected fetch: ${url}`));
        }

        const token = (init?.headers as Record<string, string> | undefined)?.Authorization?.replace(/^Bearer\s+/i, "") ?? "";
        const sub = validTokens.get(token) ?? "";
        userInfoCalls.push(sub || token);

        const failure = failingLookups.get(sub);
        if (failure === 0) throw new Error("network down");
        if (failure) {
            return new Response(JSON.stringify({ status: failure, message: "nope", data: null }), { status: failure });
        }
        const authorities = authoritiesBySub.get(sub) ?? [];
        return new Response(JSON.stringify({ status: 200, message: "ok", data: { lkAccountSub: sub, authorities } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    }) as typeof fetch;

    return () => {
        globalThis.fetch = original;
    };
}
