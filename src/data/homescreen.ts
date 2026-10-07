import { ConfigError, isRecord } from './config'

/** 홈 화면 설정 (`/api/v0/homescreen`). */
export const HOMESCREEN_CONFIG = 'homescreen'

export interface Homescreen {
  /** 대표 포스터 주소. 백엔드가 절대 주소로 바꿔서 내려 줍니다. */
  mainBannerImage: string
  /** 포스터를 볼 수 없는 사용자를 위한 대체 텍스트. 포스터를 바꾸면 함께 바꿔 주세요. */
  mainBannerAltText: string
  /** 시상식 사무국 이메일. 홈 화면 문의 칸과 아래쪽 정보에 씁니다. */
  contactEmailAddr: string
  /** 문의를 받는 시간 (예: '09:00 - 18:00'). */
  businessHours: string
  homescreenConfigLastUpdated: number
}

/**
 * 백엔드에서 아무것도 받지 못했을 때 쓰는 값.
 *
 * 홈 화면은 포스터가 비면 가운데가 텅 비어 버리므로, 다른 설정과 달리 '못 받았습니다'로 끝내지
 * 않고 이 값으로 그립니다. API 가 아예 닿지 않을 때(주소 미설정·네트워크·CORS)를 위한 것이고,
 * 저장된 설정이 비었거나 깨진 경우는 백엔드가 같은 값으로 채워 줍니다
 * (backend/src/u44be/config/U44HomescreenManager.ts — 두 곳을 같이 고쳐 주세요).
 *
 * default-main.png 는 사이트와 함께 배포되는 파일이라, 버킷이 비어 있어도 그려집니다.
 */
export const HOMESCREEN_DEFAULT: Homescreen = {
  mainBannerImage: '/default-main.png',
  mainBannerAltText: 'Main poster image',
  contactEmailAddr: 'kplain.urimal@gmail.com',
  businessHours: '09:00 - 18:00',
  homescreenConfigLastUpdated: 0,
}

/** 관리 화면이 다루는 원본 모양. 이미지는 주소가 아니라 저장된 키로 들어 있습니다. */
export interface RawHomescreenConfig {
  mainBannerImage: string
  mainBannerAltText: string
  contactEmailAddr: string
  businessHours: string
  homescreenConfigLastUpdated: number
}

/** 문자열이면 그대로, 아니거나 비었으면 기본값을 씁니다. */
function stringOr(record: Record<string, unknown>, key: string, fallback: string): string {
  const value = record[key]
  return typeof value === 'string' && value.trim() !== '' ? value : fallback
}

/**
 * 홈 화면 설정을 읽습니다.
 *
 * 항목이 하나 빠졌다고 화면을 비우지 않고, 빠진 항목만 기본값으로 채웁니다. 최상위가 객체가
 * 아닐 때만 오류로 봅니다 — 그때는 응답 자체가 설정이 아니라는 뜻이라 조용히 넘기면 안 됩니다.
 */
export function parseHomescreen(raw: unknown): Homescreen {
  if (!isRecord(raw)) throw new ConfigError(HOMESCREEN_CONFIG, '최상위는 객체여야 합니다')
  const lastUpdated = raw.homescreenConfigLastUpdated
  return {
    mainBannerImage: stringOr(raw, 'mainBannerImage', HOMESCREEN_DEFAULT.mainBannerImage),
    mainBannerAltText: stringOr(raw, 'mainBannerAltText', HOMESCREEN_DEFAULT.mainBannerAltText),
    contactEmailAddr: stringOr(raw, 'contactEmailAddr', HOMESCREEN_DEFAULT.contactEmailAddr),
    businessHours: stringOr(raw, 'businessHours', HOMESCREEN_DEFAULT.businessHours),
    homescreenConfigLastUpdated: typeof lastUpdated === 'number' ? lastUpdated : 0,
  }
}
