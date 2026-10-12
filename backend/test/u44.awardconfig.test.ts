// The award info config endpoint.
//
// The point of these is the asset rewriting: what is stored is an S3 object key, what the frontend
// receives must be a URL it can put straight into an <img src>. The other point is the shape - held
// and pending ceremonies are separate lists, and the award of the year is its own attribute.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestData } from "../src/utils/reqres/reqres.js";
import {
    AUTH_BASE,
    CLIENT_ID,
    MANAGE_AUTHORITY,
    USER_POOL_ID,
    anAdmin,
    authHeaders,
    fakeJwtVerifyModule,
    installFakeUserInfo,
    resetFakeAuth,
} from "./fakeAuth.js";

const BUCKET = "u44-test-bucket";
const ORIGIN = "https://urimalaward.com";
const ASSETS_BASE = "https://d111111abcdef8.cloudfront.net";

process.env.U44_S3_BUCKET_NAME = BUCKET;
process.env.U44_ALLOWED_ORIGIN_URLS = ORIGIN;
process.env.U44_ASSETS_BASE_URL = ASSETS_BASE;
process.env.U44_DYNAMO_DB_TABLE_NAME = "u44-test-table";
process.env.U44_AUTH_BASE_URL = AUTH_BASE;
process.env.U44_AUTH_CLIENT_ID = CLIENT_ID;
process.env.U44_AUTH_USER_POOL_ID = USER_POOL_ID;
process.env.U44_MANAGE_AUTHORITY_ID = MANAGE_AUTHORITY;

let storedConfigText = "";
const putCalls: Array<{ key: string; content: string }> = [];

vi.mock("../src/utils/aws/S3Utils.js", () => ({
    getS3TextObject: vi.fn(async () => storedConfigText),
    putS3Object: vi.fn(async (key: string, content: string) => {
        putCalls.push({ key, content });
        storedConfigText = content;
        return { status: 200, body: "Request successful" };
    }),
    generateS3PresignedUploadURL: vi.fn(),
    headS3Object: vi.fn(async () => null),
    getS3ObjectAsBytes: vi.fn(async () => null),
    putS3BinaryObject: vi.fn(async () => ({ status: 200, body: "ok" })),
    moveS3Object: vi.fn(),
    deleteS3Object: vi.fn(),
    listS3Objects: vi.fn(async () => []),
}));

vi.mock("aws-jwt-verify", () => fakeJwtVerifyModule());

const restoreFetch = installFakeUserInfo();
const ADMIN_TOKEN = "admin-token";
const { handleRequest } = await import("../src/u44be/u44.handler.js");

function request(method: RequestData["method"], path: string, body: unknown = null): RequestData {
    return { path, method, body, headers: { origin: ORIGIN, ...authHeaders(ADMIN_TOKEN) }, cookies: {}, queryParams: {}, pathParams: {}, context: new Map() };
}

const completedCeremony = {
    awardYear: 2026, awardMonth: 8, isAwardCeremonyComplete: true,
    awardCeremonyTime: 1787536800000, awardCeremonyLocation: "한국프레스센터 19층 매화홀",
    awardHostedBy: "언론협의체", awardSponsoredBy: "문화체육관광부",
    awardRepresentativePicture: "images/0199aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee.jpg",
    description: ["소개"],
    awardWinners: [{
        section: "기자", description: "설명", sectionColor: "#003FD1",
        winners: [{
            name: "서영일", image: "images/0199aaaa-bbbb-7ccc-8ddd-ffffffffffff.png",
            affiliation: "TV조선", representativeLink: "https://example.com/story",
        }],
    }],
    awardCeremonyPictures: [{
        thumbnail: "images/thumbnails/0199aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee.jpg",
        picture: "images/0199aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee.jpg",
    }],
};

/** A ceremony whose date is still undecided: the site renders it as "일정 추후 안내". */
const pendingCeremony = { awardYear: 2026, awardMonth: 10, isAwardCeremonyComplete: false };

const config = (over: Record<string, unknown> = {}) => ({
    awardCeremonies: [completedCeremony],
    awardCeremoniesPending: [pendingCeremony],
    awardInfoConfigLastUpdated: 1758000000000,
    ...over,
});

const ofTheYearHeld = { ...completedCeremony, awardMonth: 12 };

beforeEach(() => {
    resetFakeAuth();
    anAdmin(ADMIN_TOKEN); storedConfigText = ""; putCalls.length = 0; });

describe("GET /api/v0/award-info", () => {
    it("returns an empty config (200, not 204) when nothing has been stored yet", async () => {
        const res = await handleRequest(request("GET", "/api/v0/award-info"));
        // 204 would arrive with no body at all, which the frontend would read as an empty response.
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ awardCeremonies: [], awardCeremoniesPending: [], awardInfoConfigLastUpdated: 0 });
    });

    it("turns every stored asset key into a CloudFront URL", async () => {
        storedConfigText = JSON.stringify(config());
        const res = await handleRequest(request("GET", "/api/v0/award-info"));
        const entry = (res.body as any).awardCeremonies[0];

        expect(entry.awardRepresentativePicture).toBe(`${ASSETS_BASE}/images/0199aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee.jpg`);
        expect(entry.awardWinners[0].winners[0].image).toBe(`${ASSETS_BASE}/images/0199aaaa-bbbb-7ccc-8ddd-ffffffffffff.png`);
        expect(entry.awardCeremonyPictures[0].thumbnail).toBe(`${ASSETS_BASE}/images/thumbnails/0199aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee.jpg`);
        expect(entry.awardCeremonyPictures[0].picture).toBe(`${ASSETS_BASE}/images/0199aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee.jpg`);
    });

    it("keeps a winner's representativeLink, which is a link and not an asset", async () => {
        storedConfigText = JSON.stringify(config());
        const res = await handleRequest(request("GET", "/api/v0/award-info"));
        const winner = (res.body as any).awardCeremonies[0].awardWinners[0].winners[0];
        expect(winner.representativeLink).toBe("https://example.com/story");
    });

    it("leaves an already absolute URL alone", async () => {
        storedConfigText = JSON.stringify(config({
            awardCeremonies: [{ ...completedCeremony, awardRepresentativePicture: "https://example.com/elsewhere.jpg" }],
        }));
        const res = await handleRequest(request("GET", "/api/v0/award-info"));
        expect((res.body as any).awardCeremonies[0].awardRepresentativePicture).toBe("https://example.com/elsewhere.jpg");
    });

    it("passes a not-yet-held ceremony through, with no date and no venue of its own", async () => {
        storedConfigText = JSON.stringify(config());
        const res = await handleRequest(request("GET", "/api/v0/award-info"));
        const pending = (res.body as any).awardCeremoniesPending[0];
        expect(pending.awardYear).toBe(2026);
        expect(pending.awardMonth).toBe(10);
        expect(pending.isAwardCeremonyComplete).toBe(false);
        // Neither field was supplied: the time stays absent and the venue falls back to "".
        expect(pending.awardCeremonyTime).toBeUndefined();
        expect(pending.awardCeremonyLocation).toBe("");
    });
});

describe("awardCeremonyOfTheYear", () => {
    it("rewrites its asset keys when the ceremony has been held", async () => {
        storedConfigText = JSON.stringify(config({ awardCeremonyOfTheYear: ofTheYearHeld }));
        const res = await handleRequest(request("GET", "/api/v0/award-info"));
        const ofTheYear = (res.body as any).awardCeremonyOfTheYear;

        expect(ofTheYear.awardMonth).toBe(12);
        expect(ofTheYear.awardRepresentativePicture).toBe(`${ASSETS_BASE}/images/0199aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee.jpg`);
        expect(ofTheYear.awardWinners[0].winners[0].image).toBe(`${ASSETS_BASE}/images/0199aaaa-bbbb-7ccc-8ddd-ffffffffffff.png`);
    });

    it("passes it through when it has not been held yet", async () => {
        storedConfigText = JSON.stringify(config({
            awardCeremonyOfTheYear: { awardYear: 2026, awardMonth: 12, isAwardCeremonyComplete: false },
        }));
        const res = await handleRequest(request("GET", "/api/v0/award-info"));
        expect((res.body as any).awardCeremonyOfTheYear.isAwardCeremonyComplete).toBe(false);
    });

    it("is simply absent when there is none, rather than being invented", async () => {
        storedConfigText = JSON.stringify(config());
        const res = await handleRequest(request("GET", "/api/v0/award-info"));
        expect((res.body as any).awardCeremonyOfTheYear).toBeUndefined();
    });

    it("is not duplicated into the monthly list", async () => {
        storedConfigText = JSON.stringify(config({ awardCeremonyOfTheYear: ofTheYearHeld }));
        const res = await handleRequest(request("GET", "/api/v0/award-info"));
        expect((res.body as any).awardCeremonies.map((c: any) => c.awardMonth)).toEqual([8]);
    });

    it("no longer treats a December ceremony in the monthly list as the award of the year", async () => {
        // The old rule was "whatever falls in December". Now only the attribute decides, so a
        // December entry left in the monthly list stays an ordinary monthly ceremony.
        storedConfigText = JSON.stringify(config({ awardCeremonies: [{ ...completedCeremony, awardMonth: 12 }] }));
        const res = await handleRequest(request("GET", "/api/v0/award-info"));
        expect((res.body as any).awardCeremonyOfTheYear).toBeUndefined();
        expect((res.body as any).awardCeremonies).toHaveLength(1);
    });
});

describe("POST /api/management/v0/award-info", () => {
    it("stores the config it is given", async () => {
        const res = await handleRequest(request("POST", "/api/management/v0/award-info", config()));
        expect(res.status).toBe(200);
        expect(putCalls).toHaveLength(1);
        const stored = JSON.parse(putCalls[0]!.content);
        expect(stored.awardCeremonies).toHaveLength(1);
        expect(stored.awardCeremoniesPending).toHaveLength(1);
    });

    it("stamps the save time itself rather than trusting the client's", async () => {
        const before = Date.now();
        await handleRequest(request("POST", "/api/management/v0/award-info", config({ awardInfoConfigLastUpdated: 1 })));
        const stored = JSON.parse(putCalls[0]!.content);
        expect(stored.awardInfoConfigLastUpdated).toBeGreaterThanOrEqual(before);
    });

    it("stores keys, not the rewritten URLs - so a round trip does not double the prefix", async () => {
        await handleRequest(request("POST", "/api/management/v0/award-info", config()));
        const stored = JSON.parse(putCalls[0]!.content).awardCeremonies[0];
        expect(stored.awardRepresentativePicture).toBe(completedCeremony.awardRepresentativePicture);

        const res = await handleRequest(request("GET", "/api/v0/award-info"));
        expect((res.body as any).awardCeremonies[0].awardRepresentativePicture).toBe(`${ASSETS_BASE}/${completedCeremony.awardRepresentativePicture}`);
    });

    it("rejects a bare array, which is what the old config looked like", async () => {
        const res = await handleRequest(request("POST", "/api/management/v0/award-info", [completedCeremony]));
        expect(res.status).toBe(400);
        expect(putCalls).toHaveLength(0);
    });
});

describe("GET /api/management/v0/award-info (for the editor)", () => {
    it("returns the stored keys untouched, so an edit-and-save round trip keeps keys", async () => {
        storedConfigText = JSON.stringify(config({ awardCeremonyOfTheYear: ofTheYearHeld }));
        const res = await handleRequest(request("GET", "/api/management/v0/award-info"));
        expect(res.status).toBe(200);
        const body = res.body as any;

        // The public GET would have turned these into CloudFront URLs; this one must not.
        expect(body.awardCeremonies[0].awardRepresentativePicture).toBe(completedCeremony.awardRepresentativePicture);
        expect(body.awardCeremonies[0].awardCeremonyPictures[0].thumbnail).toBe(completedCeremony.awardCeremonyPictures[0].thumbnail);
        expect(body.awardCeremonyOfTheYear.awardRepresentativePicture).toBe(completedCeremony.awardRepresentativePicture);

        // Save it back unchanged and nothing has drifted.
        await handleRequest(request("POST", "/api/management/v0/award-info", res.body));
        const stored = JSON.parse(putCalls[0]!.content);
        expect(stored.awardCeremonies[0].awardRepresentativePicture).toBe(completedCeremony.awardRepresentativePicture);
        expect(stored.awardCeremonyOfTheYear.awardRepresentativePicture).toBe(completedCeremony.awardRepresentativePicture);
    });
});
