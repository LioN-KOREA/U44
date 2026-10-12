import * as v from 'valibot'

export const AwardWinnerSchema = v.object({
    name: v.string(),
    image: v.string(),
    affiliation: v.string(),
    /* The link behind the "주요 사례 보기" button. Optional: the button is only drawn when it is set. */
    representativeLink: v.fallback(v.string(), "")
});

export const AwardSectionSchema = v.object(
{
    section: v.string(),
    description: v.string(),
    sectionColor: v.string(),
    winners: v.fallback(v.array(AwardWinnerSchema), [])
});

export const AwardCeremonyPictureSchema = v.object({
    thumbnail: v.string(),
    picture: v.string()
})

export const AwardInfoSchema = v.object({
    awardYear: v.number(),
    awardMonth: v.number(),
    isAwardCeremonyComplete: v.literal(true),
    awardCeremonyTime: v.number(),
    awardCeremonyLocation: v.string(),
    awardHostedBy: v.fallback(v.string(), ""),
    awardSponsoredBy: v.fallback(v.string(), ""),
    awardRepresentativePicture: v.fallback(v.string(), ""),
    description: v.fallback(v.array(v.string()), []),
    awardWinners: v.fallback(v.array(AwardSectionSchema), []),
    awardCeremonyPictures: v.fallback(v.array(AwardCeremonyPictureSchema), []),
});

/*
 * A ceremony that has not been held yet.
 *
 * The date and the venue may still be undecided - those entries are the placeholders the schedule
 * table renders as "일정 추후 안내" - so only the year and the month are actually required.
 */
export const PendingAwardInfoSchema = v.object({
    awardYear: v.number(),
    awardMonth: v.number(),
    isAwardCeremonyComplete: v.literal(false),
    awardCeremonyTime: v.optional(v.number()),
    awardCeremonyLocation: v.fallback(v.string(), ""),
});

/*
 * The whole award config.
 *
 * Held and not-yet-held ceremonies live in separate arrays rather than one union-typed list, so a
 * reader never has to test a flag to know which fields it may rely on. The award of the year is its
 * own attribute instead of "whichever ceremony falls in December", and it may be either shape
 * depending on whether that ceremony has taken place.
 */
export const AwardInfoConfigSchema = v.object({
    awardCeremonies : v.fallback(v.array(AwardInfoSchema), []),
    awardCeremoniesPending : v.fallback(v.array(PendingAwardInfoSchema), []),
    awardCeremonyOfTheYear : v.optional(v.union([AwardInfoSchema, PendingAwardInfoSchema])),
    awardInfoConfigLastUpdated : v.number(),
})

/* -------------------------------------------------------------------------- */
/* Social Media Posts                                                                     */
/* -------------------------------------------------------------------------- */

export const SocialMediaPostItemSchema = v.object({
    image : v.string(),
    href : v.string(),
    altText : v.fallback(v.string(), ""),
})

export const SocialMediaPostsConfigSchema = v.object({
    socialMediaPosts : v.fallback(v.array(SocialMediaPostItemSchema), []),
    /* The account page. The '더 보기' button and the account-name link both point here. */
    profileURL : v.fallback(v.string(), ""),
    /* The account name as shown on the page (ex. "@urimal_award"). */
    handle : v.fallback(v.string(), ""),
    socialMediaPostsConfigLastUpdated : v.number(),
})

/* -------------------------------------------------------------------------- */
/* Home screen configuration                                                                     */
/* -------------------------------------------------------------------------- */


/*
 * This month, in KST (1~12).
 *
 * It's important that we implement this as a function. 
 * If we write this as a plain value, the value is fixed at the point when the container is initialized, 
 * so if the month changes while a warm container is reused, a stale value may be returned. 
 * In order to make sure that valibot returns a fresh value every time a request is made,
 * we should implement the fallback as a function.
 */
export const seoulMonthNow = () => new Date(Date.now() + 32400000).getUTCMonth() + 1

export const HomescreenRecommendationPopupConfigSchema = v.object({
    recommendationPopupOn : v.fallback(v.boolean(), true),
    recommendationMonth : v.fallback(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(12)), seoulMonthNow)})
/*
 * When the this month's award is OFF
 * You must not put a fallback value here - if we have a fallback here, 
 * this branch (of the union) will accept whatever value and change the PopupOn flag to false - 
 * silently ignoring a configuration where the popup is ON and swallowing whatever date / location value
 * that has been set.
 */
export const HomescreenThisMonthAwardPopupConfigDisabledSchema = v.object({
    thisMonthAwardCeremonyPopupOn : v.literal(false),
})
export const HomescreenThisMonthAwardPopupConfigEnabledSchema = v.object({
    thisMonthAwardCeremonyPopupOn : v.fallback(v.literal(true), true),
    thisMonthAwardCeremonyTime : v.number(),
    thisMonthAwardCeremonyLocation : v.fallback(v.string(), ""),
})
export const HomescreenThisMonthAwardPopupConfigSchema = v.union([HomescreenThisMonthAwardPopupConfigDisabledSchema, HomescreenThisMonthAwardPopupConfigEnabledSchema]);

export const HomescreenConfigSchema = v.object({
    mainBannerImage : v.fallback(v.string(), ""),
    /* Alt text for the banner, for anyone who cannot see it. Changed whenever the banner changes. */
    mainBannerAltText : v.fallback(v.string(), ""),
    contactEmailAddr : v.fallback(v.string(), ""),
    businessHours : v.fallback(v.string(), "09:00 - 18:00"),
    homescreenRecommendationPopupConfig : v.fallback(HomescreenRecommendationPopupConfigSchema, () => ({ recommendationPopupOn : true, recommendationMonth : seoulMonthNow() })),
    homescreenThisMonthAwardPopupConfig : v.fallback(HomescreenThisMonthAwardPopupConfigSchema, { thisMonthAwardCeremonyPopupOn : false }),
    homescreenConfigLastUpdated : v.number(),
})

/* -------------------------------------------------------------------------- */
/* Exemplary cases configuration                                                                  */
/* -------------------------------------------------------------------------- */

/* Left(Original) -> Right(Corrected). Almost all cases in the exemplary cases are in this format. */
export const ExemplaryPairSchema = v.object({
    from : v.string(),
    to : v.string(),
})

/* The title, footer, and the list of pairs. Most(6/8) of the items are in this format. */
export const ExemplarySectionSchema = v.object({
    title : v.string(),
    lead : v.fallback(v.string(), ""),
    pairs : v.fallback(v.array(ExemplaryPairSchema), []),
})

/*
 * Exemplary case data for a month
 *
 * Althogh the content changes for each month, the format remains (roughly) the same
 * (July / August of 2026 has 8 sections in the same order)
 * Therefore, we have a title for each section, 
 * since we know the shape in which the UI will render each section.
 * 
 * The person who edits the section can just fill in the texts and the pairs.
 * 
 * The id and the title will be derived for each month and year (same as the award config)
 * Do not set them into some other value, as that will result in discrepancy.
 */
export const ExemplaryCaseSchema = v.object({
    /*
     * No fallback on these: the page builds its address (/examples/2026-08) from them, and the
     * frontend refuses the whole config over one bad month - so reject it here, at save time.
     */
    exemplaryCaseYear : v.pipe(v.number(), v.integer()),
    exemplaryCaseMonth : v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(12)),
    /* 머리말 인용구. */
    lead : v.fallback(v.string(), ""),
    /* 맨 아래 '※ ...' 출처 문구. */
    sourceNote : v.fallback(v.string(), ""),

    /* 1 - 익숙한 외국어·외래어 대신 우리말로 */
    foreignToKorean : ExemplarySectionSchema,
    /* 2 - 어려운 표현을 쉽고 자연스럽게 */
    plainerWording : ExemplarySectionSchema,
    /* 3 - 약어와 전문용어는 알기 쉽게 */
    abbreviations : ExemplarySectionSchema,
    /* 4 - 한 단어 대신 뜻을 풀어 쓴 표현 */
    glosses : ExemplarySectionSchema,
    /* 5 - 보다 정확하고 신중한 표현. 아래에 덧붙이는 설명 상자가 하나 더 붙습니다. */
    carefulWording : v.object({
        title : v.string(),
        lead : v.fallback(v.string(), ""),
        pairs : v.fallback(v.array(ExemplaryPairSchema), []),
        noteTitle : v.fallback(v.string(), ""),
        noteBody : v.fallback(v.string(), ""),
    }),
    /* 6 - 방송 속 우리말. 맞춤법이 헷갈리는 짝은 따로 묶어 보여 줍니다. */
    broadcastTerms : v.object({
        title : v.string(),
        lead : v.fallback(v.string(), ""),
        pairs : v.fallback(v.array(ExemplaryPairSchema), []),
        spellingPairs : v.fallback(v.array(ExemplaryPairSchema), []),
    }),
    /* 7 - 우리말로 자리 잡아 가는 표현 */
    settlingIn : ExemplarySectionSchema,
    /* 8 - 앞으로 눈여겨볼 우리말 표현. 두 묶음으로 나눠 놓는 안내 상자입니다. */
    recommended : v.object({
        title : v.string(),
        calloutTitle : v.fallback(v.string(), "적극 권장 순화어"),
        lead : v.fallback(v.string(), ""),
        groups : v.fallback(v.array(v.array(ExemplaryPairSchema)), []),
    }),
})

/*
 * The lists below are optional, NOT fallback: a fallback on an array replaces the whole array when
 * any one item is invalid, so a single bad entry in a save would quietly store an empty list.
 */
export const ExemplaryCasesConfigSchema = v.object({
    exemplaryCases : v.optional(v.array(ExemplaryCaseSchema), []),
    exemplaryCasesConfigLastUpdated : v.number(),
})


/* -------------------------------------------------------------------------- */
/* Recommended expressions glossay                                                                   */
/* -------------------------------------------------------------------------- */
export const RecommendedGlossaryItemSchema = v.object({
    original : v.string(),
    recommended : v.string(),
})
export const RecommendedGlossaryConfigSchema = v.object({
    lastUpdatedAt : v.number(),
    /* Optional rather than fallback, for the same reason as exemplaryCases above. */
    glossary : v.optional(v.array(RecommendedGlossaryItemSchema), []),
})

/* -------------------------------------------------------------------------- */
/* Assets                                                                     */
/* -------------------------------------------------------------------------- */

/* The request body the client sends when it asks for an upload URL. */
export const AssetEntryCreationRequestSchema = v.object({
    fileName : v.string(),
    contentType : v.string()
})

export const AssetEntryCreationResponseSchema = v.object({
    assetTempKey : v.string(),
    assetUploadURL : v.string(),
    assetUploadUrlValidFor : v.number() // Usually 60 seconds
})

/*
 * Sent with the confirm call, which is the point at which the asset gets its DynamoDB record.
 *
 * The display name is the uploader's, and defaults to the original file name. It is only ever a
 * label: the stored object key stays a UUID, so renaming an asset never moves or re-uploads it.
 */
export const AssetConfirmRequestSchema = v.object({
    assetName : v.fallback(v.string(), "")
})

export const AssetRenameRequestSchema = v.object({
    assetName : v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))
})

/*
 * One stored asset as the API reports it: the DynamoDB record plus the URLs derived from its key.
 *
 * Files and images share this shape; only an image fills in the thumbnail fields. The URLs are
 * built here so the client can use them as they are, without knowing the bucket prefixes.
 */
export const AssetEntrySchema = v.object({
    assetType : v.picklist(["file", "image"]),
    assetName : v.string(),
    assetKey : v.string(),
    assetURL : v.string(),
    assetContentType : v.string(),
    assetThumbnailKey : v.fallback(v.string(), ""),
    assetThumbnailURL : v.fallback(v.string(), ""),
    size : v.number(),
    created : v.number(),
    lastModified : v.number(),
})

/* What a delete reports back. The URLs are deliberately absent - they no longer resolve. */
export const AssetDeleteResponseSchema = v.object({
    assetKey : v.string(),
    assetThumbnailKey : v.fallback(v.string(), ""),
})

export type AwardWinner = v.InferOutput<typeof AwardWinnerSchema>
export type AwardInfo = v.InferOutput<typeof AwardInfoSchema>
export type PendingAwardInfo = v.InferOutput<typeof PendingAwardInfoSchema>
export type AwardInfoConfig = v.InferOutput<typeof AwardInfoConfigSchema>
export type SocialMediaPostItem = v.InferOutput<typeof SocialMediaPostItemSchema>
export type SocialMediaPostsConfig = v.InferOutput<typeof SocialMediaPostsConfigSchema>
export type HomescreenConfig = v.InferOutput<typeof HomescreenConfigSchema>
export type ExemplaryPair = v.InferOutput<typeof ExemplaryPairSchema>
export type ExemplarySection = v.InferOutput<typeof ExemplarySectionSchema>
export type ExemplaryCase = v.InferOutput<typeof ExemplaryCaseSchema>
export type ExemplaryCasesConfig = v.InferOutput<typeof ExemplaryCasesConfigSchema>
export type RecommendedGlossaryItem = v.InferOutput<typeof RecommendedGlossaryItemSchema>
export type RecommendedGlossaryConfig = v.InferOutput<typeof RecommendedGlossaryConfigSchema>
export type AssetEntryCreationRequest = v.InferOutput<typeof AssetEntryCreationRequestSchema>
export type AssetEntryCreationResponse = v.InferOutput<typeof AssetEntryCreationResponseSchema>
export type AssetConfirmRequest = v.InferOutput<typeof AssetConfirmRequestSchema>
export type AssetRenameRequest = v.InferOutput<typeof AssetRenameRequestSchema>
export type AssetEntry = v.InferOutput<typeof AssetEntrySchema>
export type AssetDeleteResponse = v.InferOutput<typeof AssetDeleteResponseSchema>
