// Access control on the management API.
//
// The question these answer is the one that matters: can anything under /api/management be reached
// without a verified token from an account that holds the management authority?

import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import type { RequestData } from "../src/utils/reqres/reqres.js";
import {
    AUTH_BASE,
    CLIENT_ID,
    MANAGE_AUTHORITY,
    USER_POOL_ID,
    aPlainUser,
    anAdmin,
    authHeaders,
    authoritiesBySub,
    failingLookups,
    fakeJwtVerifyModule,
    installFakeUserInfo,
    resetFakeAuth,
    userInfoCalls,
    validTokens,
} from "./fakeAuth.js";

const ORIGIN = "https://urimalaward.com";

process.env.U44_S3_BUCKET_NAME = "u44-test-bucket";
process.env.U44_ALLOWED_ORIGIN_URLS = ORIGIN;
process.env.U44_ASSETS_BASE_URL = "https://assets.example.test";
process.env.U44_DYNAMO_DB_TABLE_NAME = "u44-test-table";
process.env.U44_AUTH_BASE_URL = AUTH_BASE;
process.env.U44_AUTH_CLIENT_ID = CLIENT_ID;
process.env.U44_AUTH_USER_POOL_ID = USER_POOL_ID;
process.env.U44_MANAGE_AUTHORITY_ID = MANAGE_AUTHORITY;

vi.mock("aws-jwt-verify", () => fakeJwtVerifyModule());

vi.mock("../src/utils/aws/S3Utils.js", () => ({
    getS3TextObject: vi.fn(async () => ""),
    putS3Object: vi.fn(async () => ({ status: 200, body: "Request successful" })),
    generateS3PresignedUploadURL: vi.fn(async () => ({ url: "https://s3.example/x", fileKey: "x" })),
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

const restoreFetch = installFakeUserInfo();
const { handleRequest } = await import("../src/u44be/u44.handler.js");
const { _resetAuthGuard, _expireAuthorityCache } = await import("../src/u44be/auth/U44AuthGuard.js");

afterAll(() => restoreFetch());

function request(
    method: RequestData["method"],
    path: string,
    headers: Record<string, string> = {},
    body: unknown = null,
): RequestData {
    return {
        path, method, body,
        headers: { origin: ORIGIN, ...headers },
        cookies: {}, queryParams: {}, pathParams: {}, context: new Map(),
    };
}

beforeEach(() => {
    resetFakeAuth();
    _resetAuthGuard();
});

/** Every management route, so none can quietly be left unguarded. */
const MANAGEMENT_ROUTES: Array<[RequestData["method"], string]> = [
    ["GET", "/api/management/v0/award-info"],
    ["POST", "/api/management/v0/award-info"],
    ["GET", "/api/management/v0/homescreen"],
    ["POST", "/api/management/v0/homescreen"],
    ["GET", "/api/management/v0/social-media-posts"],
    ["POST", "/api/management/v0/social-media-posts"],
    ["GET", "/api/management/v0/image"],
    ["POST", "/api/management/v0/image"],
    ["GET", "/api/management/v0/asset"],
    ["POST", "/api/management/v0/asset"],
];

describe("the management API is closed", () => {
    it("refuses every management route with no token at all", async () => {
        for (const [method, path] of MANAGEMENT_ROUTES) {
            const res = await handleRequest(request(method, path));
            expect(res.status, `${method} ${path}`).toBe(401);
        }
    });

    it("refuses a token the verifier does not accept", async () => {
        for (const [method, path] of MANAGEMENT_ROUTES) {
            const res = await handleRequest(request(method, path, authHeaders("forged-token")));
            expect(res.status, `${method} ${path}`).toBe(401);
        }
    });

    it("refuses a signed-in account that lacks the management authority", async () => {
        const token = aPlainUser();
        for (const [method, path] of MANAGEMENT_ROUTES) {
            const res = await handleRequest(request(method, path, authHeaders(token)));
            // 403, not 401: we know who this is, they simply may not.
            expect(res.status, `${method} ${path}`).toBe(403);
        }
    });

    it("lets an account holding the authority through", async () => {
        const token = anAdmin();
        const res = await handleRequest(request("GET", "/api/management/v0/award-info", authHeaders(token)));
        expect(res.status).toBe(200);
    });

    it("ignores a bearer header that is not shaped like one", async () => {
        anAdmin("good-token");
        for (const bad of ["", "Bearer", "Basic good-token", "good-token"]) {
            const res = await handleRequest(request("GET", "/api/management/v0/award-info", { authorization: bad }));
            expect(res.status, JSON.stringify(bad)).toBe(401);
        }
    });

    it("reads the header whatever case it arrives in", async () => {
        const token = anAdmin();
        const res = await handleRequest(request("GET", "/api/management/v0/award-info", { Authorization: `Bearer ${token}` }));
        expect(res.status).toBe(200);
    });

    it("puts the CORS header on a refusal too, so the browser can read the status", async () => {
        // Without this the browser reports an opaque network error and the UI cannot tell the user
        // to sign in again.
        const res = await handleRequest(request("GET", "/api/management/v0/award-info"));
        expect(res.status).toBe(401);
        expect(res.headers?.["Access-Control-Allow-Origin"]).toBe(ORIGIN);
    });
});

describe("the public API stays open", () => {
    it("serves the public reads with no token", async () => {
        for (const path of ["/api/v0/award-info", "/api/v0/homescreen", "/api/v0/social-media-posts"]) {
            const res = await handleRequest(request("GET", path));
            expect(res.status, path).toBe(200);
        }
    });

    it("still answers a preflight without a token", async () => {
        const res = await handleRequest(request("OPTIONS", "/api/management/v0/award-info"));
        // The browser sends the preflight before it can attach any header, so gating it would stop
        // every management call before it started.
        expect(res.status).toBe(204);
    });
});

describe("the authority lookup", () => {
    it("is cached per account rather than asked on every request", async () => {
        const token = anAdmin();
        for (let i = 0; i < 4; i++) {
            await handleRequest(request("GET", "/api/management/v0/award-info", authHeaders(token)));
        }
        expect(userInfoCalls).toHaveLength(1);
    });

    it("caches per account, not globally", async () => {
        const admin = anAdmin("admin-1", "sub-1");
        const other = anAdmin("admin-2", "sub-2");
        await handleRequest(request("GET", "/api/management/v0/award-info", authHeaders(admin)));
        await handleRequest(request("GET", "/api/management/v0/award-info", authHeaders(other)));
        expect(userInfoCalls).toEqual(["sub-1", "sub-2"]);
    });

    it("does not cache a failed lookup", async () => {
        const token = anAdmin("tok", "sub-x");
        failingLookups.set("sub-x", 500);

        const first = await handleRequest(request("GET", "/api/management/v0/award-info", authHeaders(token)));
        expect(first.status).toBe(403); // nothing known about them yet

        // The outage clears. The next request must ask again rather than serve a cached "no".
        failingLookups.delete("sub-x");
        const second = await handleRequest(request("GET", "/api/management/v0/award-info", authHeaders(token)));
        expect(second.status).toBe(200);
        expect(userInfoCalls).toHaveLength(2);
    });

    it("keeps serving the last known answer when the lookup breaks", async () => {
        const token = anAdmin("tok", "sub-y");
        await handleRequest(request("GET", "/api/management/v0/award-info", authHeaders(token)));

        // A transient outage should not lock out someone we already know is permitted.
        _expireAuthorityCache();
        failingLookups.set("sub-y", 0); // throws, like a network failure
        const res = await handleRequest(request("GET", "/api/management/v0/award-info", authHeaders(token)));
        expect(res.status).toBe(200);
    });

    it("refuses once the account's authority is taken away", async () => {
        const token = anAdmin("tok", "sub-z");
        expect((await handleRequest(request("GET", "/api/management/v0/award-info", authHeaders(token)))).status).toBe(200);

        authoritiesBySub.set("sub-z", []);
        _expireAuthorityCache();
        const res = await handleRequest(request("GET", "/api/management/v0/award-info", authHeaders(token)));
        expect(res.status).toBe(403);
    });
});

describe("configuration", () => {
    it("refuses everything when the authority id is not configured", async () => {
        // A missing setting must never read as "allowed".
        const { _resetAppEnv } = await import("../src/u44be/env/u44.env.js");
        const saved = process.env.U44_MANAGE_AUTHORITY_ID;
        process.env.U44_MANAGE_AUTHORITY_ID = "";
        _resetAppEnv();
        _resetAuthGuard();

        const token = anAdmin();
        const res = await handleRequest(request("GET", "/api/management/v0/award-info", authHeaders(token)));
        expect(res.status).toBe(500);

        process.env.U44_MANAGE_AUTHORITY_ID = saved;
        _resetAppEnv();
        _resetAuthGuard();
        expect((await handleRequest(request("GET", "/api/management/v0/award-info", authHeaders(token)))).status).toBe(200);
    });
});

// The token map survives _resetAuthGuard, so the fake verifier keeps accepting the same tokens.
void validTokens;
