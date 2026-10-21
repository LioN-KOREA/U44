// 첫 화면 팝업 설정, 우수사례 (config3), 용어집 (config4).
//
// 팝업 쪽에서 가장 중요한 것은 '설정이 없을 때' 입니다: 추천 팝업은 이번 달로 켜지고, 시상식
// 안내 팝업은 꺼져야 합니다. 그리고 그 '이번 달' 은 요청을 처리할 때마다 새로 계산되어야 합니다 -
// 값으로 적어 두면 따뜻한 람다가 달을 넘겨 살아 있는 동안 지난달을 계속 돌려줍니다.

import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
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

const ORIGIN = "https://urimalaward.com";

process.env.U44_S3_BUCKET_NAME = "u44-test-bucket";
process.env.U44_ALLOWED_ORIGIN_URLS = ORIGIN;
process.env.U44_ASSETS_BASE_URL = "https://assets.example.test";
process.env.U44_DYNAMO_DB_TABLE_NAME = "u44-test-table";
process.env.U44_AUTH_BASE_URL = AUTH_BASE;
process.env.U44_AUTH_CLIENT_ID = CLIENT_ID;
process.env.U44_AUTH_USER_POOL_ID = USER_POOL_ID;
process.env.U44_MANAGE_AUTHORITY_ID = MANAGE_AUTHORITY;

const stored = new Map<string, string>();
const putCalls: Array<{ key: string; content: string }> = [];

vi.mock("aws-jwt-verify", () => fakeJwtVerifyModule());

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

const restoreFetch = installFakeUserInfo();
const ADMIN_TOKEN = "admin-token";
const { handleRequest } = await import("../src/u44be/u44.handler.js");
const { seoulMonthNow } = await import("../src/u44be/u44.schemas.js");

afterAll(() => restoreFetch());

const HOMESCREEN_KEY = "configs/config0";
const EXEMPLARY_KEY = "configs/config3";
const GLOSSARY_KEY = "configs/config4";

function request(method: RequestData["method"], path: string, body: unknown = null): RequestData {
    return {
        path, method, body,
        headers: { origin: ORIGIN, ...authHeaders(ADMIN_TOKEN) },
        cookies: {}, queryParams: {}, pathParams: {}, context: new Map(),
    };
}

beforeEach(() => {
    resetFakeAuth();
    anAdmin(ADMIN_TOKEN);
    stored.clear();
    putCalls.length = 0;
});

/* -------------------------------------------------------------------------- */
/* 첫 화면 팝업                                                                */
/* -------------------------------------------------------------------------- */

describe("home screen popups", () => {
    it("turns the recommendation popup on for the current month when nothing is set", async () => {
        const res = await handleRequest(request("GET", "/api/v0/homescreen"));
        const body = res.body as any;
        expect(body.homescreenRecommendationPopupConfig.recommendationPopupOn).toBe(true);
        expect(body.homescreenRecommendationPopupConfig.recommendationMonth).toBe(seoulMonthNow());
    });

    it("leaves the award notice popup off when nothing is set", async () => {
        // 보여 줄 일정이 없는데 '이달의 시상식' 이라고만 뜨면 안내가 되지 않습니다.
        const res = await handleRequest(request("GET", "/api/v0/homescreen"));
        expect((res.body as any).homescreenThisMonthAwardPopupConfig).toEqual({
            thisMonthAwardCeremonyPopupOn: false,
        });
    });

    it("computes the default month per request, not once at module load", async () => {
        /*
         * 따뜻한 람다는 몇 시간씩 살아 있습니다. 기본값을 값으로 적어 두면 그 컨테이너가 뜬
         * 순간의 달이 굳어, 달이 바뀌어도 지난달을 계속 돌려줍니다.
         */
        const realNow = Date.now;
        try {
            Date.now = () => Date.parse("2026-03-15T12:00:00+09:00");
            const march = await handleRequest(request("GET", "/api/v0/homescreen"));
            expect((march.body as any).homescreenRecommendationPopupConfig.recommendationMonth).toBe(3);

            // 같은 프로세스 안에서 달만 넘깁니다.
            Date.now = () => Date.parse("2026-04-01T09:00:00+09:00");
            const april = await handleRequest(request("GET", "/api/v0/homescreen"));
            expect((april.body as any).homescreenRecommendationPopupConfig.recommendationMonth).toBe(4);
        } finally {
            Date.now = realNow;
        }
    });

    it("keeps the popup settings it is given", async () => {
        const popups = {
            homescreenRecommendationPopupConfig: { recommendationPopupOn: false, recommendationMonth: 11 },
            homescreenThisMonthAwardPopupConfig: {
                thisMonthAwardCeremonyPopupOn: true,
                thisMonthAwardCeremonyTime: 1792000000000,
                thisMonthAwardCeremonyLocation: "한국방송회관 회견장",
            },
        };
        stored.set(HOMESCREEN_KEY, JSON.stringify({ ...popups, homescreenConfigLastUpdated: 1 }));

        const res = await handleRequest(request("GET", "/api/v0/homescreen"));
        const body = res.body as any;
        expect(body.homescreenRecommendationPopupConfig).toEqual(popups.homescreenRecommendationPopupConfig);
        expect(body.homescreenThisMonthAwardPopupConfig).toEqual(popups.homescreenThisMonthAwardPopupConfig);
    });

    it("stores the popup settings through a save", async () => {
        const config = {
            mainBannerImage: "", mainBannerAltText: "", contactEmailAddr: "", businessHours: "",
            homescreenRecommendationPopupConfig: { recommendationPopupOn: true, recommendationMonth: 12 },
            homescreenThisMonthAwardPopupConfig: { thisMonthAwardCeremonyPopupOn: false },
            homescreenConfigLastUpdated: 0,
        };
        const res = await handleRequest(request("POST", "/api/management/v0/homescreen", config));
        expect(res.status).toBe(200);
        const written = JSON.parse(putCalls[0]!.content);
        expect(written.homescreenRecommendationPopupConfig.recommendationMonth).toBe(12);
        expect(written.homescreenThisMonthAwardPopupConfig.thisMonthAwardCeremonyPopupOn).toBe(false);
    });

    it("falls back to the current month for a recommendation month outside 1~12", async () => {
        // 빈 칸으로 저장하면 0월이 됩니다. '0월 시상식' 문구가 뜨느니 이번 달이 낫습니다.
        await handleRequest(request("POST", "/api/management/v0/homescreen", {
            mainBannerImage: "", mainBannerAltText: "", contactEmailAddr: "", businessHours: "",
            homescreenRecommendationPopupConfig: { recommendationPopupOn: true, recommendationMonth: 0 },
            homescreenConfigLastUpdated: 0,
        }));
        expect(JSON.parse(putCalls[0]!.content).homescreenRecommendationPopupConfig.recommendationMonth)
            .toBe(seoulMonthNow());
    });

    it("falls back to off for an award popup that is on but carries no date", async () => {
        /*
         * 날짜 없이 켜진 팝업은 안내가 되지 않습니다. 스키마의 fallback 이 이런 설정을 '꺼짐' 으로
         * 바꿔 두므로, 공개 API 가 반쪽짜리 팝업을 내보내는 일은 없습니다.
         *
         * 관리 화면에서는 이 상태를 만들 수 없습니다 - 켜는 순간 날짜를 함께 채웁니다.
         */
        const res = await handleRequest(request("POST", "/api/management/v0/homescreen", {
            mainBannerImage: "", mainBannerAltText: "", contactEmailAddr: "", businessHours: "",
            homescreenThisMonthAwardPopupConfig: { thisMonthAwardCeremonyPopupOn: true },
            homescreenConfigLastUpdated: 0,
        }));
        expect(res.status).toBe(200);
        expect(JSON.parse(putCalls[0]!.content).homescreenThisMonthAwardPopupConfig).toEqual({
            thisMonthAwardCeremonyPopupOn: false,
        });
    });

    it("keeps an enabled popup enabled, rather than coercing it to off", async () => {
        /*
         * 꺼짐 갈래에 fallback 이 붙어 있으면 그 갈래가 무엇이든 받아들여, union 에서 먼저라는
         * 이유만으로 켜진 팝업까지 꺼 버립니다 (날짜·장소도 함께 사라집니다).
         */
        const enabled = {
            thisMonthAwardCeremonyPopupOn: true,
            thisMonthAwardCeremonyTime: 1792000000000,
            thisMonthAwardCeremonyLocation: "한국방송회관 회견장",
        };
        await handleRequest(request("POST", "/api/management/v0/homescreen", {
            mainBannerImage: "", mainBannerAltText: "", contactEmailAddr: "", businessHours: "",
            homescreenThisMonthAwardPopupConfig: enabled,
            homescreenConfigLastUpdated: 0,
        }));
        expect(JSON.parse(putCalls[0]!.content).homescreenThisMonthAwardPopupConfig).toEqual(enabled);

        const res = await handleRequest(request("GET", "/api/v0/homescreen"));
        expect((res.body as any).homescreenThisMonthAwardPopupConfig).toEqual(enabled);
    });
});

/* -------------------------------------------------------------------------- */
/* 첫 화면 시상식 일정                                                          */
/* -------------------------------------------------------------------------- */

describe("home screen award schedule", () => {
    const base = {
        mainBannerImage: "", mainBannerAltText: "", contactEmailAddr: "", businessHours: "",
        homescreenConfigLastUpdated: 0,
    };

    it("stores the schedule and serves it publicly, time and location optional", async () => {
        const schedule = [
            { awardYear: 2026, awardMonth: 11, awardTime: 1792000000000, awardLocation: "프레스센터", isAwardOfTheYear: false },
            { awardYear: 2026, awardMonth: 12, isAwardOfTheYear: true },
        ];
        const saved = await handleRequest(request("POST", "/api/management/v0/homescreen", { ...base, homescreenAwardSchedule: schedule }));
        expect(saved.status).toBe(200);
        expect(JSON.parse(putCalls[0]!.content).homescreenAwardSchedule).toEqual(schedule);

        const res = await handleRequest(request("GET", "/api/v0/homescreen"));
        expect((res.body as any).homescreenAwardSchedule).toEqual(schedule);
    });

    it("leaves the key out when the schedule follows the award config", async () => {
        // 키가 없다는 것 자체가 '시상식 설정을 따름' 이라는 뜻입니다. 빈 배열로 채우면 안 됩니다.
        await handleRequest(request("POST", "/api/management/v0/homescreen", base));
        expect("homescreenAwardSchedule" in JSON.parse(putCalls[0]!.content)).toBe(false);

        const res = await handleRequest(request("GET", "/api/v0/homescreen"));
        expect("homescreenAwardSchedule" in (res.body as any)).toBe(false);
    });

    it("rejects a row with a month outside 1~12 rather than dropping the schedule", async () => {
        const res = await handleRequest(request("POST", "/api/management/v0/homescreen", {
            ...base, homescreenAwardSchedule: [{ awardYear: 2026, awardMonth: 0, isAwardOfTheYear: false }],
        }));
        expect(res.status).toBe(400);
        expect(putCalls).toHaveLength(0);
    });
});

/* -------------------------------------------------------------------------- */
/* 우수사례 (config3)                                                          */
/* -------------------------------------------------------------------------- */

const emptySection = (title: string) => ({ title, lead: "", pairs: [] });

const aCase = (year: number, month: number) => ({
    exemplaryCaseYear: year,
    exemplaryCaseMonth: month,
    lead: "“그 달의 머리말”",
    sourceNote: "※ 출처",
    foreignToKorean: { title: "외국어 대신 우리말로", lead: "머리말", pairs: [{ from: "톱티어", to: "최상위" }] },
    plainerWording: emptySection("쉽고 자연스럽게"),
    abbreviations: emptySection("약어"),
    glosses: emptySection("풀어 쓴 표현"),
    carefulWording: { ...emptySection("신중한 표현"), noteTitle: "덧붙임", noteBody: "본문" },
    broadcastTerms: { ...emptySection("방송 속 우리말"), spellingPairs: [{ from: "에어콘", to: "에어컨" }] },
    settlingIn: emptySection("자리 잡아 가는 표현"),
    recommended: { title: "눈여겨볼 표현", calloutTitle: "적극 권장 순화어", lead: "", groups: [[{ from: "AX", to: "인공지능 전환" }]] },
});

describe("exemplary cases (config3)", () => {
    it("returns an empty config when nothing has been stored yet", async () => {
        const res = await handleRequest(request("GET", "/api/v0/exemplary-cases"));
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ exemplaryCases: [], exemplaryCasesConfigLastUpdated: 0 });
    });

    it("stores under config3 and reads the months back", async () => {
        const config = { exemplaryCases: [aCase(2026, 7), aCase(2026, 8)], exemplaryCasesConfigLastUpdated: 0 };
        const saved = await handleRequest(request("POST", "/api/management/v0/exemplary-cases", config));
        expect(saved.status).toBe(200);
        expect(putCalls[0]!.key).toBe(EXEMPLARY_KEY);

        const res = await handleRequest(request("GET", "/api/v0/exemplary-cases"));
        const body = res.body as any;
        expect(body.exemplaryCases.map((c: any) => c.exemplaryCaseMonth)).toEqual([7, 8]);
        expect(body.exemplaryCases[0].broadcastTerms.spellingPairs).toEqual([{ from: "에어콘", to: "에어컨" }]);
        expect(body.exemplaryCases[0].recommended.groups[0][0]).toEqual({ from: "AX", to: "인공지능 전환" });
    });

    it("stamps the save time itself rather than trusting the client's", async () => {
        const before = Date.now();
        await handleRequest(request("POST", "/api/management/v0/exemplary-cases", {
            exemplaryCases: [], exemplaryCasesConfigLastUpdated: 1,
        }));
        expect(JSON.parse(putCalls[0]!.content).exemplaryCasesConfigLastUpdated).toBeGreaterThanOrEqual(before);
    });

    it("rejects a bare array", async () => {
        const res = await handleRequest(request("POST", "/api/management/v0/exemplary-cases", [aCase(2026, 7)]));
        expect(res.status).toBe(400);
        expect(putCalls).toHaveLength(0);
    });

    it("rejects a month outside 1~12", async () => {
        // 화면은 잘못된 달이 하나라도 있으면 목록 전체를 거부하므로, 저장할 때 막아야 합니다.
        const res = await handleRequest(request("POST", "/api/management/v0/exemplary-cases", {
            exemplaryCases: [aCase(2026, 7), aCase(2026, 13)], exemplaryCasesConfigLastUpdated: 0,
        }));
        expect(res.status).toBe(400);
        expect(putCalls).toHaveLength(0);
    });

    it("fills the callout title in when a month leaves it out", async () => {
        const bare = { ...aCase(2026, 9), recommended: { title: "눈여겨볼 표현", lead: "", groups: [] } };
        stored.set(EXEMPLARY_KEY, JSON.stringify({ exemplaryCases: [bare], exemplaryCasesConfigLastUpdated: 0 }));
        const res = await handleRequest(request("GET", "/api/v0/exemplary-cases"));
        expect((res.body as any).exemplaryCases[0].recommended.calloutTitle).toBe("적극 권장 순화어");
    });
});

/* -------------------------------------------------------------------------- */
/* 용어집 (config4)                                                            */
/* -------------------------------------------------------------------------- */

describe("glossary (config4)", () => {
    it("returns an empty glossary when nothing has been stored yet", async () => {
        const res = await handleRequest(request("GET", "/api/v0/glossary"));
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ lastUpdatedAt: 0, glossary: [] });
    });

    it("stores under config4 and reads the terms back", async () => {
        const config = {
            lastUpdatedAt: 0,
            glossary: [
                { original: "1코노미", recommended: "1인 경제" },
                { original: "AED", recommended: "심장 충격기" },
            ],
        };
        const saved = await handleRequest(request("POST", "/api/management/v0/glossary", config));
        expect(saved.status).toBe(200);
        expect(putCalls[0]!.key).toBe(GLOSSARY_KEY);

        const res = await handleRequest(request("GET", "/api/v0/glossary"));
        expect((res.body as any).glossary).toHaveLength(2);
        expect((res.body as any).glossary[1]).toEqual({ original: "AED", recommended: "심장 충격기" });
    });

    it("replaces the whole list rather than merging", async () => {
        // 파일 하나가 곧 새 목록입니다. 예전 낱말이 남으면 지운 낱말이 되살아납니다.
        await handleRequest(request("POST", "/api/management/v0/glossary", {
            lastUpdatedAt: 0, glossary: [{ original: "a", recommended: "가" }, { original: "b", recommended: "나" }],
        }));
        await handleRequest(request("POST", "/api/management/v0/glossary", {
            lastUpdatedAt: 0, glossary: [{ original: "c", recommended: "다" }],
        }));
        const res = await handleRequest(request("GET", "/api/v0/glossary"));
        expect((res.body as any).glossary).toEqual([{ original: "c", recommended: "다" }]);
    });

    it("takes a list the size of the real glossary", async () => {
        // 2,500여 개를 JSON 으로 한 번에 보냅니다 (프리사인 업로드를 쓰지 않는 이유).
        const glossary = Array.from({ length: 2600 }, (_, i) => ({
            original: `term-${i}`, recommended: `우리말-${i}`,
        }));
        const res = await handleRequest(request("POST", "/api/management/v0/glossary", { lastUpdatedAt: 0, glossary }));
        expect(res.status).toBe(200);
        expect(JSON.parse(putCalls[0]!.content).glossary).toHaveLength(2600);
    });

    it("rejects a list with one malformed term instead of storing an empty list", async () => {
        // 배열에 fallback 을 걸면 낱말 하나가 잘못돼도 목록 전체가 [] 로 바뀌어 저장됩니다.
        const res = await handleRequest(request("POST", "/api/management/v0/glossary", {
            lastUpdatedAt: 0, glossary: [{ original: "a", recommended: "가" }, { original: "b" }],
        }));
        expect(res.status).toBe(400);
        expect(putCalls).toHaveLength(0);
    });

    it("rejects a body that is not a glossary config", async () => {
        const res = await handleRequest(request("POST", "/api/management/v0/glossary", [{ original: "a", recommended: "가" }]));
        expect(res.status).toBe(400);
        expect(putCalls).toHaveLength(0);
    });
});

/* -------------------------------------------------------------------------- */
/* 접근 제어                                                                   */
/* -------------------------------------------------------------------------- */

describe("the new management routes are gated too", () => {
    it("refuses them without a token, and serves the public reads without one", async () => {
        const noToken = (method: RequestData["method"], path: string): RequestData => ({
            path, method, body: null, headers: { origin: ORIGIN },
            cookies: {}, queryParams: {}, pathParams: {}, context: new Map(),
        });

        for (const path of ["/api/management/v0/exemplary-cases", "/api/management/v0/glossary"]) {
            expect((await handleRequest(noToken("GET", path))).status, path).toBe(401);
            expect((await handleRequest(noToken("POST", path))).status, path).toBe(401);
        }
        for (const path of ["/api/v0/exemplary-cases", "/api/v0/glossary"]) {
            expect((await handleRequest(noToken("GET", path))).status, path).toBe(200);
        }
    });
});
