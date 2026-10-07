// The home screen and social media config endpoints.
//
// Same two concerns as the award config: what is stored is an S3 object key, what the frontend
// receives must be a URL it can put straight into an <img src>. The home screen adds one of its own -
// it must never answer without a banner, because an empty banner leaves a hole in the landing page.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestData } from "../src/utils/reqres/reqres.js";

const BUCKET = "u44-test-bucket";
const ORIGIN = "https://urimalaward.com";
const ASSETS_BASE = "https://d111111abcdef8.cloudfront.net";
/* Must match HOMESCREEN_DEFAULTS in U44HomescreenManager.ts (and the frontend's HOMESCREEN_DEFAULT). */
const DEFAULT_BANNER = "/default-main.png";
const DEFAULT_ALT_TEXT = "Main poster image";
const DEFAULT_EMAIL = "kplain.urimal@gmail.com";
const DEFAULT_HOURS = "09:00 - 18:00";

process.env.U44_S3_BUCKET_NAME = BUCKET;
process.env.U44_ALLOWED_ORIGIN_URLS = ORIGIN;
process.env.U44_ASSETS_BASE_URL = ASSETS_BASE;
process.env.U44_DYNAMO_DB_TABLE_NAME = "u44-test-table";

/** key -> stored text. The three configs live under different keys in the same bucket. */
const stored = new Map<string, string>();
const putCalls: Array<{ key: string; content: string }> = [];

vi.mock("../src/utils/aws/S3Utils.js", () => ({
    getS3TextObject: vi.fn(async (key: string) => stored.get(key) ?? ""),
    putS3Object: vi.fn(async (key: string, content: string) => {
        putCalls.push({ key, content });
        stored.set(key, content);
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

const { handleRequest } = await import("../src/u44be/u44.handler.js");

const HOMESCREEN_KEY = "configs/config0";
const SOCIAL_KEY = "configs/config2";

function request(method: RequestData["method"], path: string, body: unknown = null): RequestData {
    return { path, method, body, headers: { origin: ORIGIN }, cookies: {}, queryParams: {}, pathParams: {}, context: new Map() };
}

beforeEach(() => { stored.clear(); putCalls.length = 0; });

/* -------------------------------------------------------------------------- */
/* Home screen                                                                */
/* -------------------------------------------------------------------------- */

const homescreen = {
    mainBannerImage: "images/0199aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee.png",
    mainBannerAltText: "2026 쉽고 바른 우리말 언론인상",
    contactEmailAddr: "kplain.urimal@gmail.com",
    businessHours: "09:00 - 18:00",
    homescreenConfigLastUpdated: 1758000000000,
};

describe("GET /api/v0/homescreen", () => {
    it("turns the stored banner key into a CloudFront URL", async () => {
        stored.set(HOMESCREEN_KEY, JSON.stringify(homescreen));
        const res = await handleRequest(request("GET", "/api/v0/homescreen"));
        expect(res.status).toBe(200);
        const body = res.body as any;

        expect(body.mainBannerImage).toBe(`${ASSETS_BASE}/${homescreen.mainBannerImage}`);
        expect(body.mainBannerAltText).toBe(homescreen.mainBannerAltText);
        expect(body.contactEmailAddr).toBe(homescreen.contactEmailAddr);
        expect(body.businessHours).toBe(homescreen.businessHours);
    });

    it("leaves an already absolute banner URL alone", async () => {
        stored.set(HOMESCREEN_KEY, JSON.stringify({ ...homescreen, mainBannerImage: "https://example.com/banner.png" }));
        const res = await handleRequest(request("GET", "/api/v0/homescreen"));
        expect((res.body as any).mainBannerImage).toBe("https://example.com/banner.png");
    });

    it("falls back to the default banner when nothing has been stored at all", async () => {
        const res = await handleRequest(request("GET", "/api/v0/homescreen"));
        // A missing banner would leave a hole in the middle of the landing page, so this config -
        // unlike the others - never answers without one.
        expect(res.status).toBe(200);
        expect((res.body as any).mainBannerImage).toBe(DEFAULT_BANNER);
        expect((res.body as any).mainBannerAltText).not.toBe("");
    });

    it("falls back when the stored config names no banner", async () => {
        stored.set(HOMESCREEN_KEY, JSON.stringify({ ...homescreen, mainBannerImage: "" }));
        const res = await handleRequest(request("GET", "/api/v0/homescreen"));
        expect((res.body as any).mainBannerImage).toBe(DEFAULT_BANNER);
        // Alt text written for a chosen banner would be wrong on the default one, so it falls back too.
        expect((res.body as any).mainBannerAltText).toBe(DEFAULT_ALT_TEXT);
        // The rest of the config is still the stored one.
        expect((res.body as any).contactEmailAddr).toBe(homescreen.contactEmailAddr);
    });

    it("fills in the contact details when the stored config leaves them empty", async () => {
        stored.set(HOMESCREEN_KEY, JSON.stringify({ ...homescreen, contactEmailAddr: "", businessHours: "" }));
        const res = await handleRequest(request("GET", "/api/v0/homescreen"));
        // "이메일:  (평일 )" would be a nonsense sentence on the landing page.
        expect((res.body as any).contactEmailAddr).toBe(DEFAULT_EMAIL);
        expect((res.body as any).businessHours).toBe(DEFAULT_HOURS);
    });

    it("answers a completely unset config with every default filled in", async () => {
        const res = await handleRequest(request("GET", "/api/v0/homescreen"));
        expect(res.body).toEqual({
            mainBannerImage: DEFAULT_BANNER,
            mainBannerAltText: DEFAULT_ALT_TEXT,
            contactEmailAddr: DEFAULT_EMAIL,
            businessHours: DEFAULT_HOURS,
            homescreenConfigLastUpdated: 0,
        });
    });

    it("falls back, with 200, even when the stored config is unreadable", async () => {
        stored.set(HOMESCREEN_KEY, "{ this is not json");
        const res = await handleRequest(request("GET", "/api/v0/homescreen"));
        // The landing page should look ordinary rather than broken while the config is being fixed.
        expect(res.status).toBe(200);
        expect((res.body as any).mainBannerImage).toBe(DEFAULT_BANNER);
    });

    it("does not treat the default banner as a bucket key", async () => {
        // "/default-main.png" ships with the frontend, so prefixing it with the CloudFront base
        // would point at an object that is not there.
        const res = await handleRequest(request("GET", "/api/v0/homescreen"));
        expect((res.body as any).mainBannerImage.startsWith(ASSETS_BASE)).toBe(false);
    });
});

describe("POST /api/management/v0/homescreen", () => {
    it("stores the config under config0 and stamps the save time itself", async () => {
        const before = Date.now();
        const res = await handleRequest(request("POST", "/api/management/v0/homescreen", { ...homescreen, homescreenConfigLastUpdated: 1 }));
        expect(res.status).toBe(200);
        expect(putCalls).toHaveLength(1);
        expect(putCalls[0]!.key).toBe(HOMESCREEN_KEY);
        expect(JSON.parse(putCalls[0]!.content).homescreenConfigLastUpdated).toBeGreaterThanOrEqual(before);
    });

    it("stores the key, not the rewritten URL - so a round trip does not double the prefix", async () => {
        await handleRequest(request("POST", "/api/management/v0/homescreen", homescreen));
        expect(JSON.parse(putCalls[0]!.content).mainBannerImage).toBe(homescreen.mainBannerImage);

        const res = await handleRequest(request("GET", "/api/v0/homescreen"));
        expect((res.body as any).mainBannerImage).toBe(`${ASSETS_BASE}/${homescreen.mainBannerImage}`);
    });

    it("rejects a body that is not a homescreen config", async () => {
        const res = await handleRequest(request("POST", "/api/management/v0/homescreen", [homescreen]));
        expect(res.status).toBe(400);
        expect(putCalls).toHaveLength(0);
    });
});

describe("GET /api/management/v0/homescreen (for the editor)", () => {
    it("returns the stored key untouched and does not invent a default banner", async () => {
        stored.set(HOMESCREEN_KEY, JSON.stringify({ ...homescreen, mainBannerImage: "" }));
        const res = await handleRequest(request("GET", "/api/management/v0/homescreen"));
        expect(res.status).toBe(200);
        // Substituting the default here would make the editor save it as a real choice.
        expect((res.body as any).mainBannerImage).toBe("");
    });

    it("keeps keys through an edit-and-save round trip", async () => {
        stored.set(HOMESCREEN_KEY, JSON.stringify(homescreen));
        const res = await handleRequest(request("GET", "/api/management/v0/homescreen"));
        expect((res.body as any).mainBannerImage).toBe(homescreen.mainBannerImage);

        await handleRequest(request("POST", "/api/management/v0/homescreen", res.body));
        expect(JSON.parse(putCalls[0]!.content).mainBannerImage).toBe(homescreen.mainBannerImage);
    });
});

/* -------------------------------------------------------------------------- */
/* Social media posts                                                         */
/* -------------------------------------------------------------------------- */

const social = {
    socialMediaPosts: [
        {
            image: "images/0199aaaa-bbbb-7ccc-8ddd-111111111111.png",
            href: "https://www.instagram.com/p/DbcpdbeIKts/",
            altText: "인스타그램 게시글 3",
        },
        {
            image: "images/0199aaaa-bbbb-7ccc-8ddd-222222222222.png",
            href: "https://www.instagram.com/p/DchvOx_IOLj/",
            altText: "인스타그램 게시글 6",
        },
    ],
    profileURL: "https://www.instagram.com/urimal_award/",
    handle: "@urimal_award",
    socialMediaPostsConfigLastUpdated: 1758000000000,
};

describe("GET /api/v0/social-media-posts", () => {
    it("turns every stored post image into a CloudFront URL", async () => {
        stored.set(SOCIAL_KEY, JSON.stringify(social));
        const res = await handleRequest(request("GET", "/api/v0/social-media-posts"));
        expect(res.status).toBe(200);
        const posts = (res.body as any).socialMediaPosts;

        expect(posts[0].image).toBe(`${ASSETS_BASE}/${social.socialMediaPosts[0]!.image}`);
        expect(posts[1].image).toBe(`${ASSETS_BASE}/${social.socialMediaPosts[1]!.image}`);
    });

    it("never rewrites href - it points at the post, not at an asset", async () => {
        stored.set(SOCIAL_KEY, JSON.stringify(social));
        const res = await handleRequest(request("GET", "/api/v0/social-media-posts"));
        const posts = (res.body as any).socialMediaPosts;
        expect(posts[0].href).toBe(social.socialMediaPosts[0]!.href);
        expect(posts[1].href).toBe(social.socialMediaPosts[1]!.href);
    });

    it("keeps the profile URL and the handle, which the '더 보기' button and the account link use", async () => {
        stored.set(SOCIAL_KEY, JSON.stringify(social));
        const res = await handleRequest(request("GET", "/api/v0/social-media-posts"));
        expect((res.body as any).profileURL).toBe(social.profileURL);
        expect((res.body as any).handle).toBe(social.handle);
    });

    it("keeps each post's alt text", async () => {
        stored.set(SOCIAL_KEY, JSON.stringify(social));
        const res = await handleRequest(request("GET", "/api/v0/social-media-posts"));
        expect((res.body as any).socialMediaPosts[0].altText).toBe("인스타그램 게시글 3");
    });

    it("returns an empty config (200, not 204) when nothing has been stored yet", async () => {
        const res = await handleRequest(request("GET", "/api/v0/social-media-posts"));
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            socialMediaPosts: [],
            profileURL: "",
            handle: "",
            socialMediaPostsConfigLastUpdated: 0,
        });
    });
});

describe("POST /api/management/v0/social-media-posts", () => {
    it("stores the config under config2 and stamps the save time itself", async () => {
        const before = Date.now();
        const res = await handleRequest(request("POST", "/api/management/v0/social-media-posts", { ...social, socialMediaPostsConfigLastUpdated: 1 }));
        expect(res.status).toBe(200);
        expect(putCalls[0]!.key).toBe(SOCIAL_KEY);
        expect(JSON.parse(putCalls[0]!.content).socialMediaPostsConfigLastUpdated).toBeGreaterThanOrEqual(before);
    });

    it("stores keys, not the rewritten URLs", async () => {
        await handleRequest(request("POST", "/api/management/v0/social-media-posts", social));
        const storedPosts = JSON.parse(putCalls[0]!.content).socialMediaPosts;
        expect(storedPosts[0].image).toBe(social.socialMediaPosts[0]!.image);
    });

    it("rejects a bare array", async () => {
        const res = await handleRequest(request("POST", "/api/management/v0/social-media-posts", social.socialMediaPosts));
        expect(res.status).toBe(400);
        expect(putCalls).toHaveLength(0);
    });
});

describe("GET /api/management/v0/social-media-posts (for the editor)", () => {
    it("keeps keys through an edit-and-save round trip", async () => {
        stored.set(SOCIAL_KEY, JSON.stringify(social));
        const res = await handleRequest(request("GET", "/api/management/v0/social-media-posts"));
        expect((res.body as any).socialMediaPosts[0].image).toBe(social.socialMediaPosts[0]!.image);

        await handleRequest(request("POST", "/api/management/v0/social-media-posts", res.body));
        expect(JSON.parse(putCalls[0]!.content).socialMediaPosts[0].image).toBe(social.socialMediaPosts[0]!.image);
    });
});

/* -------------------------------------------------------------------------- */
/* The three configs are separate objects                                     */
/* -------------------------------------------------------------------------- */

describe("config keys", () => {
    it("writes each config to its own key, so one does not overwrite another", async () => {
        await handleRequest(request("POST", "/api/management/v0/homescreen", homescreen));
        await handleRequest(request("POST", "/api/management/v0/social-media-posts", social));
        await handleRequest(request("POST", "/api/management/v0/award-info", {
            awardCeremonies: [], awardCeremoniesPending: [], awardInfoConfigLastUpdated: 0,
        }));

        expect(putCalls.map(c => c.key)).toEqual([HOMESCREEN_KEY, SOCIAL_KEY, "configs/config1"]);
        expect(new Set(putCalls.map(c => c.key)).size).toBe(3);

        // And each still reads back as itself.
        expect((await handleRequest(request("GET", "/api/v0/homescreen")) as any).body.contactEmailAddr).toBe(homescreen.contactEmailAddr);
        expect((await handleRequest(request("GET", "/api/v0/social-media-posts")) as any).body.handle).toBe(social.handle);
    });
});
