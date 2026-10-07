import { ConfigError, isRecord, optionalString, requireString } from './config'

/*
 * Social media posts configuration (`/api/v0/social-media-posts`). 
 * Formerly 'instaposts' 
 */
export const SOCIAL_MEDIA_CONFIG = 'socialMedia'

export interface SocialMediaPost {
  /** The URL to the social media article. 
   * NOT managed by our backend, since it is the URL to the original article. */
  href: string
  /** The URL of the image that will appear on the list, 
   * provided by the backend as an absolute URL. */
  image: string
  altText: string
}

export interface SocialMedia {
  /** The URL of the social media page (account)
   *  Will be used for the more('더 보기') button and the account name link.
   */
  profileURL: string
  /** The account name that will appear on the page (e,g, '@urimal_award'). */
  handle: string
  posts: SocialMediaPost[]
}

/*
 * The shape of the data that will be managed by the management page. 
 * The image keys are provided as their UUID(object key)s, NOT their URLs.
 */
export interface RawSocialMediaConfig {
  socialMediaPosts: { image: string; href: string; altText: string }[]
  profileURL: string
  handle: string
  socialMediaPostsConfigLastUpdated: number
}

/**
 * 누리소통망 설정을 읽습니다.
 *
 * 계정 주소와 이름은 없어도 오류로 보지 않습니다. 아직 아무것도 등록하지 않은 상태가 그런
 * 모습이고, 그럴 때는 화면에 오류를 띄우는 것보다 이 칸을 아예 그리지 않는 편이 낫습니다
 * (WinnersPage 가 글이 하나도 없으면 칸을 숨깁니다).
 */
export function parseSocialMedia(raw: unknown): SocialMedia {
  if (!isRecord(raw)) throw new ConfigError(SOCIAL_MEDIA_CONFIG, '최상위는 객체여야 합니다')
  if (!Array.isArray(raw.socialMediaPosts)) {
    throw new ConfigError(SOCIAL_MEDIA_CONFIG, 'socialMediaPosts 는 배열이어야 합니다')
  }

  return {
    profileURL: optionalString(SOCIAL_MEDIA_CONFIG, raw, 'profileURL', '(최상위)') ?? '',
    handle: optionalString(SOCIAL_MEDIA_CONFIG, raw, 'handle', '(최상위)') ?? '',
    posts: raw.socialMediaPosts.map((post, index): SocialMediaPost => {
      const where = `socialMediaPosts[${index}]`
      if (!isRecord(post)) throw new ConfigError(SOCIAL_MEDIA_CONFIG, `${where} 는 객체여야 합니다`)
      return {
        href: requireString(SOCIAL_MEDIA_CONFIG, post, 'href', where),
        image: requireString(SOCIAL_MEDIA_CONFIG, post, 'image', where),
        // An empty alternative text will not result in a broken page, so we set this as optional
        altText: optionalString(SOCIAL_MEDIA_CONFIG, post, 'altText', where) ?? '',
      }
    }),
  }
}
