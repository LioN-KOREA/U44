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


export const HomescreenConfigSchema = v.object({
    mainBannerImage : v.fallback(v.string(), ""),
    /* Alt text for the banner, for anyone who cannot see it. Changed whenever the banner changes. */
    mainBannerAltText : v.fallback(v.string(), ""),
    contactEmailAddr : v.fallback(v.string(), ""),
    businessHours : v.fallback(v.string(), "09:00 - 18:00"),
    homescreenConfigLastUpdated : v.number(),
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
export type AssetEntryCreationRequest = v.InferOutput<typeof AssetEntryCreationRequestSchema>
export type AssetEntryCreationResponse = v.InferOutput<typeof AssetEntryCreationResponseSchema>
export type AssetConfirmRequest = v.InferOutput<typeof AssetConfirmRequestSchema>
export type AssetRenameRequest = v.InferOutput<typeof AssetRenameRequestSchema>
export type AssetEntry = v.InferOutput<typeof AssetEntrySchema>
export type AssetDeleteResponse = v.InferOutput<typeof AssetDeleteResponseSchema>
