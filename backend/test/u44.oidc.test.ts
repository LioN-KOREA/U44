// Sign-in through the account system's OpenID Connect provider, end to end.
//
// Nothing about the protocol is stubbed out: a fake account system answers discovery, the JWKS,
// /token, /revoke and userInfo over a stubbed fetch, and signs real RS256 tokens. That lets these
// tests hold the integration to the guide's checklist (연동 안내서 §9) - PKCE and state checked,
// the refresh token kept off the browser, refreshes serialised, invalid_grant ending the session,
// logout going through /lpx/oauth/logout - and the token verifier to every check in §5.

import { createHash } from "node:crypto";
import * as jose from "jose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestData, ResponseData, RRSetCookie } from "../src/utils/reqres/reqres.js";

const ORIGIN = "https://d1kdqje0mi6yok.cloudfront.net";
const ISSUER = "https://accounts.example.test";
const CLIENT_ID = "falm03vg6r35htb27ctg7rjda";
const REDIRECT_URI = `${ORIGIN}/manage`;
const POST_LOGOUT_URI = `${ORIGIN}/`;
const MANAGE_AUTHORITY = "519093fd-d789-4853-b117-45187186ccb3";

process.env.U44_S3_BUCKET_NAME = "u44-test-bucket";
process.env.U44_ALLOWED_ORIGIN_URLS = ORIGIN;
process.env.U44_ASSETS_BASE_URL = "https://assets.example.test";
process.env.U44_DYNAMO_DB_TABLE_NAME = "u44-test-table";
process.env.U44_OIDC_ISSUER = ISSUER;
process.env.U44_AUTH_CLIENT_ID = CLIENT_ID;
process.env.U44_OIDC_REDIRECT_URI = REDIRECT_URI;
process.env.U44_OIDC_POST_LOGOUT_REDIRECT_URI = POST_LOGOUT_URI;
process.env.U44_MANAGE_AUTHORITY_ID = MANAGE_AUTHORITY;

vi.mock("../src/utils/aws/S3Utils.js", () => ({
    getS3TextObject: vi.fn(async () => ""),
    putS3Object: vi.fn(async () => ({ status: 200, body: "Request successful" })),
    generateS3PresignedUploadURL: vi.fn(),
    headS3Object: vi.fn(async () => null),
    getS3ObjectAsBytes: vi.fn(async () => null),
    putS3BinaryObject: vi.fn(async () => ({ status: 200, body: "ok" })),
    moveS3Object: vi.fn(),
    deleteS3Object: vi.fn(),
    listS3Objects: vi.fn(async () => []),
}));

vi.mock("../src/utils/aws/DynamoDBUtils.js", async (importOriginal) => {
    const original = await importOriginal<typeof import("../src/utils/aws/DynamoDBUtils.js")>();
    const fake = await import("./fakeDynamoDB.js");
    return {
        ...original,
        dynamoDBPut: fake.dynamoDBPut,
        dynamoDBGet: fake.dynamoDBGet,
        dynamoDBQuery: fake.dynamoDBQuery,
        dynamoDBUpdate: fake.dynamoDBUpdate,
        dynamoDBDelete: fake.dynamoDBDelete,
    };
});

/* -------------------------------------------------------------------------- */
/* The fake account system                                                    */
/* -------------------------------------------------------------------------- */

type SigningKey = { kid: string; privateKey: CryptoKey; jwk: jose.JWK };

async function newKey(kid: string): Promise<SigningKey> {
    const { privateKey, publicKey } = await jose.generateKeyPair("RS256", { extractable: true });
    return { kid, privateKey, jwk: { ...(await jose.exportJWK(publicKey)), kid, alg: "RS256", use: "sig" } };
}

let keyA: SigningKey;
let keyB: SigningKey;

const authorityBySub = new Map<string, string[]>();
/** code -> what /authorize was asked for. */
const issuedCodes = new Map<string, { challenge: string; redirectUri: string; nonce: string; sub: string }>();
/** The one refresh token each session may present next; anything older is a replay. */
const liveRefreshTokens = new Map<string, string>();
const killedChains = new Set<string>();

const calls = { token: 0, refresh: 0, revoke: [] as string[], jwks: 0 };
let accessTtlSec = 300;
/** How long /token takes, to make concurrent refreshes actually overlap. */
let tokenDelayMs = 0;
/** Fail the next n refreshes with this OAuth error. */
let refreshFailures: { error: string; remaining: number } | null = null;

const signAccess = (sub: string, overrides: Record<string, unknown> = {}, key = keyA, ttl = accessTtlSec) =>
    new jose.SignJWT({ token_use: "access", client_id: CLIENT_ID, scope: "openid", role: "r-1", ...overrides })
        .setProtectedHeader({ alg: "RS256", kid: key.kid })
        .setIssuer(ISSUER)
        .setAudience(CLIENT_ID)
        .setSubject(sub)
        .setJti(crypto.randomUUID())
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + ttl)
        .sign(key.privateKey);

const signId = (sub: string, nonce: string) =>
    new jose.SignJWT({ token_use: "id", nonce, email: `${sub}@example.test`, name: "홍길동" })
        .setProtectedHeader({ alg: "RS256", kid: keyA.kid })
        .setIssuer(ISSUER)
        .setAudience(CLIENT_ID)
        .setSubject(sub)
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(keyA.privateKey);

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const oauthError = (error: string, status = 400) => json({ error, error_description: error }, status);

async function issueTokens(sub: string, chain: string, nonce?: string) {
    // "rt.<chain>.<nonce>": the chain names the session, so a replay can be traced to it.
    const refreshToken = `rt.${chain}.${crypto.randomUUID()}`;
    liveRefreshTokens.set(chain, refreshToken);
    return json({
        access_token: await signAccess(sub),
        ...(nonce ? { id_token: await signId(sub, nonce) } : {}),
        refresh_token: refreshToken,
        token_type: "Bearer",
        expires_in: accessTtlSec,
        scope: "openid",
    });
}

async function fakeAccountSystem(url: URL, init?: RequestInit): Promise<Response> {
    if (url.pathname === "/.well-known/openid-configuration") {
        return json({
            issuer: ISSUER,
            authorization_endpoint: `${ISSUER}/lpx/oauth/authorize`,
            token_endpoint: `${ISSUER}/lpx/oauth/token`,
            revocation_endpoint: `${ISSUER}/lpx/oauth/revoke`,
            end_session_endpoint: `${ISSUER}/lpx/oauth/logout`,
            userinfo_endpoint: `${ISSUER}/lpx/auth/userInfo`,
            jwks_uri: `${ISSUER}/.well-known/jwks.json`,
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code", "refresh_token"],
            subject_types_supported: ["public"],
            id_token_signing_alg_values_supported: ["RS256"],
            token_endpoint_auth_methods_supported: ["none"],
            code_challenge_methods_supported: ["S256"],
        });
    }
    if (url.pathname === "/.well-known/jwks.json") {
        calls.jwks++;
        // Two keys, always (§5) - which one signs rotates.
        return json({ keys: [keyA.jwk, keyB.jwk] });
    }
    if (url.pathname === "/lpx/auth/userInfo") {
        const token = new Headers(init?.headers).get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
        const sub = jose.decodeJwt(token).sub ?? "";
        return json({
            status: 200, message: "Request successful",
            data: { lkAccountSub: sub, lkAccountEmail: `${sub}@example.test`, lkAccountName: "홍길동", authorities: authorityBySub.get(sub) ?? [] },
        });
    }

    const form = new URLSearchParams(typeof init?.body === "string" ? init.body : init?.body?.toString() ?? "");
    if (url.pathname === "/lpx/oauth/revoke") {
        calls.revoke.push(form.get("token") ?? "");
        return new Response(null, { status: 200 });
    }
    if (url.pathname === "/lpx/oauth/token") {
        calls.token++;
        if (tokenDelayMs) await new Promise((resolve) => setTimeout(resolve, tokenDelayMs));
        if (form.get("client_id") !== CLIENT_ID) return oauthError("invalid_client", 401);

        if (form.get("grant_type") === "authorization_code") {
            const issued = issuedCodes.get(form.get("code") ?? "");
            issuedCodes.delete(form.get("code") ?? ""); // single use
            if (!issued) return oauthError("invalid_grant");
            const challenge = createHash("sha256").update(form.get("code_verifier") ?? "").digest("base64url");
            if (challenge !== issued.challenge) return oauthError("invalid_grant");
            if (form.get("redirect_uri") !== issued.redirectUri) return oauthError("invalid_grant");
            return issueTokens(issued.sub, crypto.randomUUID(), issued.nonce);
        }

        if (form.get("grant_type") === "refresh_token") {
            calls.refresh++;
            if (refreshFailures && refreshFailures.remaining > 0) {
                refreshFailures.remaining--;
                return oauthError(refreshFailures.error, refreshFailures.error === "server_error" ? 500 : 400);
            }
            const presented = form.get("refresh_token") ?? "";
            const chain = presented.split(".")[1] ?? "";
            if (killedChains.has(chain)) return oauthError("invalid_grant");
            if (liveRefreshTokens.get(chain) !== presented) {
                // A rotated-away token was replayed: treated as theft, the whole session ends (§4.3).
                killedChains.add(chain);
                return oauthError("invalid_grant");
            }
            const sub = "sub-admin";
            return issueTokens(sub, chain);
        }
        return oauthError("unsupported_grant_type");
    }
    return new Response("not found", { status: 404 });
}

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

const originalFetch = globalThis.fetch;
let handleRequest: (req: RequestData) => Promise<ResponseData<unknown>>;
let fakeDb: typeof import("./fakeDynamoDB.js");
let resets: Array<() => void> = [];

beforeAll(async () => {
    keyA = await newKey("key-a");
    keyB = await newKey("key-b");
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (url.origin !== ISSUER) throw new Error(`unexpected fetch: ${url}`);
        // openid-client hands over a Request; read it into init so the fake sees one shape.
        if (input instanceof Request) {
            return fakeAccountSystem(url, { method: input.method, headers: input.headers, body: await input.text() });
        }
        return fakeAccountSystem(url, init);
    }) as typeof fetch;

    ({ handleRequest } = await import("../src/u44be/u44.handler.js"));
    fakeDb = await import("./fakeDynamoDB.js");
    const guard = await import("../src/u44be/auth/U44AuthGuard.js");
    const sessions = await import("../src/u44be/auth/U44SessionManager.js");
    resets = [guard._resetAuthGuard, sessions._resetSessionManager];
});

afterAll(() => {
    globalThis.fetch = originalFetch;
});

beforeEach(() => {
    resets.forEach((reset) => reset());
    fakeDb.items.clear();
    authorityBySub.clear();
    authorityBySub.set("sub-admin", [MANAGE_AUTHORITY]);
    issuedCodes.clear();
    liveRefreshTokens.clear();
    killedChains.clear();
    calls.token = 0;
    calls.refresh = 0;
    calls.revoke.length = 0;
    calls.jwks = 0;
    accessTtlSec = 300;
    tokenDelayMs = 0;
    refreshFailures = null;
});

/** A browser: remembers the cookies the API sets, and sends them back. */
class Browser {
    cookies = new Map<string, RRSetCookie>();

    async call(method: RequestData["method"], path: string, body: unknown = null, headers: Record<string, string> = {}) {
        const res = await handleRequest({
            path, method, body,
            headers: { origin: ORIGIN, ...headers },
            cookies: Object.fromEntries([...this.cookies].map(([key, c]) => [key, c.value])),
            queryParams: {}, pathParams: {}, context: new Map(),
        });
        for (const c of res.cookies ?? []) {
            if (c.maxAge <= 0) this.cookies.delete(c.key);
            else this.cookies.set(c.key, c);
        }
        return res;
    }

    /** Follow /api/auth/login to /authorize, and play the account system's part: issue a code. */
    async authorize(sub = "sub-admin") {
        const login = await this.call("GET", "/api/auth/login");
        const location = new URL(String(login.headers?.Location));
        const params = location.searchParams;
        const code = `code-${crypto.randomUUID()}`;
        issuedCodes.set(code, {
            challenge: params.get("code_challenge") ?? "",
            redirectUri: params.get("redirect_uri") ?? "",
            nonce: params.get("nonce") ?? "",
            sub,
        });
        return { login, location, code, state: params.get("state") ?? "" };
    }

    async signIn(sub = "sub-admin") {
        const { code, state } = await this.authorize(sub);
        return this.call("POST", "/api/auth/session", { callback: `?code=${code}&state=${state}` });
    }
}

type View = { accessToken: string; expiresAt: number; user: { sub: string; email: string; name: string; canManage: boolean } };

/* -------------------------------------------------------------------------- */
/* Sign-in                                                                    */
/* -------------------------------------------------------------------------- */

describe("starting a sign-in", () => {
    it("sends the browser to /authorize with PKCE S256, state and nonce", async () => {
        const { login, location } = await new Browser().authorize();
        expect(login.status).toBe(302);
        expect(`${location.origin}${location.pathname}`).toBe(`${ISSUER}/lpx/oauth/authorize`);
        const p = location.searchParams;
        expect(p.get("response_type")).toBe("code");
        expect(p.get("client_id")).toBe(CLIENT_ID);
        // Matched byte for byte against the registered value.
        expect(p.get("redirect_uri")).toBe(REDIRECT_URI);
        expect(p.get("code_challenge_method")).toBe("S256");
        expect(p.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(p.get("state")).toBeTruthy();
        expect(p.get("nonce")).toBeTruthy();
        expect(p.get("scope")).toBe("openid");
    });

    it("keeps the verifier in an HttpOnly cookie scoped to /api/auth, never in the URL", async () => {
        const browser = new Browser();
        const { location } = await browser.authorize();
        const flow = browser.cookies.get("u44_oidc")!;
        expect(flow).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/api/auth" });
        expect(location.searchParams.has("code_verifier")).toBe(false);
    });

    it("uses a fresh verifier and state for every attempt", async () => {
        const first = await new Browser().authorize();
        const second = await new Browser().authorize();
        expect(first.state).not.toBe(second.state);
        expect(first.location.searchParams.get("code_challenge")).not.toBe(second.location.searchParams.get("code_challenge"));
    });
});

describe("completing a sign-in", () => {
    it("exchanges the code and opens a session, handing the browser only an access token", async () => {
        const browser = new Browser();
        const res = await browser.signIn();
        expect(res.status).toBe(200);

        const view = res.body as View;
        expect(view.user).toEqual({ sub: "sub-admin", email: "sub-admin@example.test", name: "홍길동", canManage: true });
        expect(view.expiresAt).toBeGreaterThan(Date.now());

        // The refresh token stays on the backend (§2): not in the body, not in a cookie.
        const refreshToken = [...liveRefreshTokens.values()][0]!;
        expect(JSON.stringify(res.body)).not.toContain(refreshToken);
        expect([...browser.cookies.values()].map((c) => c.value)).not.toContain(refreshToken);

        // The browser now holds a session id only, and the flow cookie is spent.
        expect(browser.cookies.has("u44_oidc")).toBe(false);
        const session = browser.cookies.get("u44_session")!;
        expect(session).toMatchObject({ httpOnly: true, secure: true, path: "/api/auth" });
    });

    it("stores the session under a hash of the id, not the id the browser holds", async () => {
        const browser = new Browser();
        await browser.signIn();
        const sessionId = browser.cookies.get("u44_session")!.value;
        const keys = [...fakeDb.items.keys()];
        expect(keys.some((key) => key.includes(sessionId))).toBe(false);
        expect(keys).toContain(`SESSION#${createHash("sha256").update(sessionId).digest("hex")}|SESSION`);
    });

    it("reports an account without the management authority as unable to manage", async () => {
        authorityBySub.set("sub-user", ["something-else"]);
        const res = await new Browser().signIn("sub-user");
        expect(res.status).toBe(200);
        expect((res.body as View).user.canManage).toBe(false);
    });

    it("refuses a callback whose state is not the one this browser was given", async () => {
        const browser = new Browser();
        const { code } = await browser.authorize();
        const res = await browser.call("POST", "/api/auth/session", { callback: `?code=${code}&state=forged` });
        expect(res.status).toBe(400);
        expect(calls.token).toBe(0);
        expect(browser.cookies.has("u44_session")).toBe(false);
    });

    it("refuses a code planted in a browser that never began a sign-in", async () => {
        const victim = new Browser();
        const { code, state } = await new Browser().authorize();
        const res = await victim.call("POST", "/api/auth/session", { callback: `?code=${code}&state=${state}` });
        expect(res.status).toBe(400);
        expect(calls.token).toBe(0);
    });

    it("refuses an error the account system sent back, without calling /token", async () => {
        const browser = new Browser();
        const { state } = await browser.authorize();
        const res = await browser.call("POST", "/api/auth/session", { callback: `?error=access_denied&state=${state}` });
        expect(res.status).toBe(400);
        expect(res.body).toContain("access_denied");
        expect(calls.token).toBe(0);
    });

    it("uses a flow only once", async () => {
        const browser = new Browser();
        const { code, state } = await browser.authorize();
        await browser.call("POST", "/api/auth/session", { callback: `?code=${code}&state=${state}` });
        const again = await browser.call("POST", "/api/auth/session", { callback: `?code=${code}&state=${state}` });
        expect(again.status).toBe(400);
    });
});

/* -------------------------------------------------------------------------- */
/* The management API with a real token                                       */
/* -------------------------------------------------------------------------- */

describe("the access token from a sign-in", () => {
    it("opens the management API", async () => {
        const browser = new Browser();
        const { accessToken } = (await browser.signIn()).body as View;
        const res = await browser.call("GET", "/api/management/v0/homescreen", null, { authorization: `Bearer ${accessToken}` });
        expect(res.status).toBe(200);
    });
});

/* -------------------------------------------------------------------------- */
/* Token verification (§5)                                                    */
/* -------------------------------------------------------------------------- */

describe("token verification", () => {
    const managementGet = (token: string) =>
        new Browser().call("GET", "/api/management/v0/homescreen", null, { authorization: `Bearer ${token}` });

    it("selects the key by kid, so either published key verifies", async () => {
        expect((await managementGet(await signAccess("sub-admin", {}, keyA))).status).toBe(200);
        expect((await managementGet(await signAccess("sub-admin", {}, keyB))).status).toBe(200);
    });

    it("refuses a token issued to a different client", async () => {
        const token = await new jose.SignJWT({ token_use: "access" })
            .setProtectedHeader({ alg: "RS256", kid: keyA.kid })
            .setIssuer(ISSUER).setAudience("another-client").setSubject("sub-admin")
            .setIssuedAt().setExpirationTime("5m").sign(keyA.privateKey);
        expect((await managementGet(token)).status).toBe(401);
    });

    it("refuses a token from another issuer", async () => {
        const token = await new jose.SignJWT({ token_use: "access" })
            .setProtectedHeader({ alg: "RS256", kid: keyA.kid })
            .setIssuer("https://evil.example.test").setAudience(CLIENT_ID).setSubject("sub-admin")
            .setIssuedAt().setExpirationTime("5m").sign(keyA.privateKey);
        expect((await managementGet(token)).status).toBe(401);
    });

    it("refuses an id token", async () => {
        expect((await managementGet(await signAccess("sub-admin", { token_use: "id" }))).status).toBe(401);
    });

    it("allows 60s of clock skew, and no more", async () => {
        expect((await managementGet(await signAccess("sub-admin", {}, keyA, -30))).status).toBe(200);
        expect((await managementGet(await signAccess("sub-admin", {}, keyA, -120))).status).toBe(401);
    });

    it("refuses an HS256 token, whatever it claims", async () => {
        const token = await new jose.SignJWT({ token_use: "access" })
            .setProtectedHeader({ alg: "HS256", kid: keyA.kid })
            .setIssuer(ISSUER).setAudience(CLIENT_ID).setSubject("sub-admin")
            .setIssuedAt().setExpirationTime("5m").sign(new TextEncoder().encode("a-shared-secret-of-enough-length!!"));
        expect((await managementGet(token)).status).toBe(401);
    });

    it("refuses an unsigned token", async () => {
        const token = new jose.UnsecuredJWT({ token_use: "access" })
            .setIssuer(ISSUER).setAudience(CLIENT_ID).setSubject("sub-admin").setExpirationTime("5m").encode();
        expect((await managementGet(token)).status).toBe(401);
    });

    it("caches the key document rather than fetching it per request", async () => {
        await managementGet(await signAccess("sub-admin"));
        await managementGet(await signAccess("sub-admin"));
        await managementGet(await signAccess("sub-admin", {}, keyB));
        expect(calls.jwks).toBe(1);
    });
});

/* -------------------------------------------------------------------------- */
/* Refresh (§4.3)                                                             */
/* -------------------------------------------------------------------------- */

describe("refreshing", () => {
    it("hands out the current token while it is fresh, without calling /token", async () => {
        const browser = new Browser();
        const first = (await browser.signIn()).body as View;
        const tokenCalls = calls.token;
        const res = await browser.call("POST", "/api/auth/refresh");
        expect(res.status).toBe(200);
        expect((res.body as View).accessToken).toBe(first.accessToken);
        expect(calls.token).toBe(tokenCalls);
    });

    it("signs a reloaded page back in from the session cookie alone", async () => {
        const browser = new Browser();
        await browser.signIn();
        // A reload loses the access token (it lived in memory) but keeps the cookie.
        const res = await browser.call("POST", "/api/auth/refresh");
        expect(res.status).toBe(200);
        expect((res.body as View).user.canManage).toBe(true);
    });

    it("rotates once the token runs short, and stores the new refresh token", async () => {
        accessTtlSec = 30; // under the 60s refresh-ahead, so every refresh rotates
        const browser = new Browser();
        const first = (await browser.signIn()).body as View;

        const second = await browser.call("POST", "/api/auth/refresh");
        expect(second.status).toBe(200);
        expect((second.body as View).accessToken).not.toBe(first.accessToken);

        // Had the old refresh token been reused, the fake would have ended the session.
        const third = await browser.call("POST", "/api/auth/refresh");
        expect(third.status).toBe(200);
        expect(calls.refresh).toBe(2);
        expect(killedChains.size).toBe(0);
    });

    it("serialises concurrent refreshes, so a rotated token is never replayed", async () => {
        accessTtlSec = 30; // the sign-in's token is already due for a refresh...
        const browser = new Browser();
        await browser.signIn();
        accessTtlSec = 300; // ...and the one the refresh brings back is good for a while
        tokenDelayMs = 150;

        // Three tabs (or three Lambda containers) ask at the same moment.
        const results = await Promise.all([
            browser.call("POST", "/api/auth/refresh"),
            browser.call("POST", "/api/auth/refresh"),
            browser.call("POST", "/api/auth/refresh"),
        ]);
        expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
        // One rotation; the others waited for it and were handed the token it stored.
        expect(calls.refresh).toBe(1);
        expect(new Set(results.map((r) => (r.body as View).accessToken)).size).toBe(1);
        expect(killedChains.size).toBe(0);
    });

    it("signs out on invalid_grant, without retrying", async () => {
        accessTtlSec = 30;
        const browser = new Browser();
        await browser.signIn();
        refreshFailures = { error: "invalid_grant", remaining: 1 };

        const res = await browser.call("POST", "/api/auth/refresh");
        expect(res.status).toBe(401);
        expect(calls.refresh).toBe(1);
        expect(browser.cookies.has("u44_session")).toBe(false);
        expect([...fakeDb.items.keys()].some((key) => key.startsWith("SESSION#"))).toBe(false);
    });

    it("tries once more after a server_error", async () => {
        accessTtlSec = 30;
        const browser = new Browser();
        await browser.signIn();
        refreshFailures = { error: "server_error", remaining: 1 };

        const res = await browser.call("POST", "/api/auth/refresh");
        expect(res.status).toBe(200);
        expect(calls.refresh).toBe(2);
    });

    it("answers 401 to a browser with no session", async () => {
        const res = await new Browser().call("POST", "/api/auth/refresh");
        expect(res.status).toBe(401);
    });
});

/* -------------------------------------------------------------------------- */
/* Logout (§4.5)                                                              */
/* -------------------------------------------------------------------------- */

describe("signing out", () => {
    it("revokes the refresh token, forgets the session and points the browser at /logout", async () => {
        const browser = new Browser();
        await browser.signIn();
        const refreshToken = [...liveRefreshTokens.values()][0]!;

        const res = await browser.call("POST", "/api/auth/logout");
        expect(res.status).toBe(200);
        expect(calls.revoke).toEqual([refreshToken]);
        expect(browser.cookies.has("u44_session")).toBe(false);

        const logoutUrl = new URL((res.body as { logoutUrl: string }).logoutUrl);
        expect(`${logoutUrl.origin}${logoutUrl.pathname}`).toBe(`${ISSUER}/lpx/oauth/logout`);
        expect(logoutUrl.searchParams.get("client_id")).toBe(CLIENT_ID);
        expect(logoutUrl.searchParams.get("post_logout_redirect_uri")).toBe(POST_LOGOUT_URI);

        // The session is gone on this side too.
        expect((await browser.call("POST", "/api/auth/refresh")).status).toBe(401);
    });

    it("still points the browser at /logout when there was no session", async () => {
        const res = await new Browser().call("POST", "/api/auth/logout");
        expect(res.status).toBe(200);
        expect((res.body as { logoutUrl: string }).logoutUrl).toContain("/lpx/oauth/logout");
    });
});
