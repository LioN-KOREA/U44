/**
 * Code for fetching the award winner data.
 *
 * The award winner data is fetched through the config.ts module, which is in charge of
 * the loading & caching of the data.
 * If you need to change the URL, just change the configUrl on the config.ts file.
 *
 * 원본은 하나의 객체입니다 (예전처럼 배열이 아닙니다):
 *   - awardCeremonies        : 이미 열린 시상식. 수상자·사진이 들어 있습니다.
 *   - awardCeremoniesPending : 아직 열리지 않은 시상식. 일정표에만 나옵니다.
 *   - awardCeremonyOfTheYear : '올해의 언론인상' 시상식. 열렸는지에 따라 위 두 모양 중 하나이고,
 *                              없을 수도 있습니다 (12월이라는 규칙으로 고르지 않습니다).
 *
 * 이미지 경로는 백엔드가 이미 절대 URL 로 바꿔서 내려 줍니다. 앞에 덧붙일 것이 없습니다.
 */

import { ConfigError, isRecord, optionalString } from './config'

/** 이미 열린 시상식 한 건의 원본 모양. */
export interface RawAwardCeremony {
  awardYear: number
  awardMonth: number
  /** 시상식이 끝나 수상자를 공개할 수 있는지. false 면 일정표에만 나옵니다. */
  isAwardCeremonyComplete: boolean
  /** 시상 시각. 밀리초 타임스탬프(숫자) 또는 "2026-09-22T11:00:00+09:00" 형태의 문자열. */
  awardCeremonyTime?: number | string
  awardCeremonyLocation?: string
  awardHostedBy?: string
  awardSponsoredBy?: string
  awardRepresentativePicture?: string
  description?: string[]
  awardWinners?: RawAwardSection[]
  awardCeremonyPictures?: { thumbnail: string; picture: string }[]
}

/** 설정 파일(또는 API 응답) 전체의 원본 모양. */
export interface RawAwardConfig {
  awardCeremonies: RawAwardCeremony[]
  awardCeremoniesPending: RawAwardCeremony[]
  awardCeremonyOfTheYear?: RawAwardCeremony
  awardInfoConfigLastUpdated: number
}

export interface RawAwardSection {
  section: string
  description: string
  sectionColor: string
  winners: RawWinner[]
}

export interface RawWinner {
  name: string
  image: string
  affiliation: string
  /** '주요 사례 보기' 단추가 열 주소. 없으면 단추를 그리지 않습니다. */
  representativeLink?: string
}

/** 화면에서 쓰기 좋게 다듬은 모양. */
export interface Winner {
  name: string
  affiliation: string
  imageUrl: string
  /** 비어 있으면 '주요 사례 보기' 단추를 숨깁니다. */
  representativeLink: string
}

export interface AwardSection {
  section: string
  description: string
  color: string
  winners: Winner[]
}

/** 시상식 현장 사진 한 장. 목록에는 thumbnail, 확대 보기에는 picture 를 씁니다. */
export interface CeremonyPicture {
  thumbnail: string
  picture: string
}

export interface AwardCeremony {
  /** 목록/상세를 잇는 식별자. 주소에도 쓰입니다 (예: '2026-08'). */
  id: string
  year: number
  month: number
  /** '2026년 8월 수상자' 또는 '2026년 올해의 언론인상' */
  title: string
  ceremonyTime: number | null
  location: string
  hostedBy: string
  sponsoredBy: string
  description: string[]
  representativePicture: string | null
  sections: AwardSection[]
  ceremonyPictures: CeremonyPicture[]
  /** 시상식이 끝났는지. false 면 일정표에만 나옵니다. */
  complete: boolean
  /** '올해의 언론인상' 시상식인지. awardCeremonyOfTheYear 로 들어온 한 건만 true 입니다. */
  ofTheYear: boolean
}

/** 시상식 자료 전체를 화면용으로 다듬은 모양. */
export interface AwardData {
  /** 달별 시상식 (올해의 언론인상은 빠져 있습니다), 최신순. */
  monthly: AwardCeremony[]
  /** '올해의 언론인상' 시상식. 설정에 없으면 null. */
  ofTheYear: AwardCeremony | null
  /** 달별 + 올해의 언론인상을 합친 목록, 최신순. 목록 화면에서 씁니다. */
  all: AwardCeremony[]
}

function normalizeCeremony(raw: RawAwardCeremony, ceremonyTime: number | null, ofTheYear: boolean): AwardCeremony {
  const sections: AwardSection[] = (raw.awardWinners ?? []).map((section) => ({
    section: section.section,
    description: section.description,
    color: section.sectionColor,
    winners: (section.winners ?? []).map((winner) => ({
      name: winner.name,
      affiliation: winner.affiliation,
      imageUrl: winner.image,
      representativeLink: winner.representativeLink ?? '',
    })),
  }))

  return {
    id: `${raw.awardYear}-${String(raw.awardMonth).padStart(2, '0')}`,
    year: raw.awardYear,
    month: raw.awardMonth,
    title: ofTheYear ? `${raw.awardYear}년 올해의 언론인상` : `${raw.awardYear}년 ${raw.awardMonth}월 수상자`,
    ceremonyTime,
    location: raw.awardCeremonyLocation ?? '',
    hostedBy: raw.awardHostedBy ?? '',
    sponsoredBy: raw.awardSponsoredBy ?? '',
    description: raw.description ?? [],
    representativePicture: raw.awardRepresentativePicture || null,
    sections,
    // 축소본을 따로 주면 그것을 쓰고, 없으면 원본을 그대로 씁니다.
    ceremonyPictures: (raw.awardCeremonyPictures ?? []).map((entry) => ({
      thumbnail: entry.thumbnail || entry.picture,
      picture: entry.picture,
    })),
    complete: raw.isAwardCeremonyComplete,
    ofTheYear,
  }
}

/** 시상식 자료의 설정 이름. 다른 설정과 같은 통로(data/config.ts)로 불러옵니다. */
export const AWARDS_CONFIG = 'awards'

/** 서울 시각 기준의 달 (1~12). */
function seoulMonth(time: number): number {
  return Number(
    new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric' })
      .formatToParts(time)
      .find((part) => part.type === 'month')?.value,
  )
}

/** awardCeremonyTime 을 밀리초로 바꿉니다. 없으면 null (일정 미정). */
function parseCeremonyTime(value: unknown, where: string): number | null {
  if (value === undefined || value === null || value === '') return null
  const time = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN
  if (!Number.isFinite(time)) {
    throw new ConfigError(
      AWARDS_CONFIG,
      `${where}.awardCeremonyTime 을 날짜로 읽을 수 없습니다 (밀리초 숫자 또는 "2026-09-22T11:00:00+09:00")`,
    )
  }
  return time
}

/** 한 회차를 검사하고 화면용 모양으로 바꿉니다. */
function parseEntry(raw: unknown, where: string, ofTheYear: boolean): AwardCeremony {
  if (!isRecord(raw)) throw new ConfigError(AWARDS_CONFIG, `${where} 는 객체여야 합니다`)

  const { awardYear, awardMonth, isAwardCeremonyComplete } = raw
  if (typeof awardYear !== 'number' || !Number.isInteger(awardYear)) {
    throw new ConfigError(AWARDS_CONFIG, `${where}.awardYear 는 정수여야 합니다 (예: 2026)`)
  }
  if (typeof awardMonth !== 'number' || !Number.isInteger(awardMonth) || awardMonth < 1 || awardMonth > 12) {
    throw new ConfigError(AWARDS_CONFIG, `${where}.awardMonth 는 1~12 사이의 정수여야 합니다`)
  }
  if (typeof isAwardCeremonyComplete !== 'boolean') {
    throw new ConfigError(
      AWARDS_CONFIG,
      `${where}(${awardYear}년 ${awardMonth}월).isAwardCeremonyComplete 는 true 또는 false 여야 합니다`,
    )
  }
  optionalString(AWARDS_CONFIG, raw, 'awardCeremonyLocation', where)

  const time = parseCeremonyTime(raw.awardCeremonyTime, where)
  // 달과 시각이 서로 다른 달을 가리키면 일정표가 엉뚱해지므로 미리 막습니다.
  if (time !== null && seoulMonth(time) !== awardMonth) {
    throw new ConfigError(
      AWARDS_CONFIG,
      `${where} 의 awardMonth(${awardMonth}) 와 awardCeremonyTime(${seoulMonth(time)}월) 이 서로 다릅니다`,
    )
  }

  return normalizeCeremony(raw as unknown as RawAwardCeremony, time, ofTheYear)
}

const byNewestFirst = (a: AwardCeremony, b: AwardCeremony) => b.year - a.year || b.month - a.month

function parseList(value: unknown, field: string, complete: boolean): AwardCeremony[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new ConfigError(AWARDS_CONFIG, `${field} 는 배열이어야 합니다`)
  return value.map((entry, index) => checkListed(parseEntry(entry, `${field}[${index}]`, false), `${field}[${index}]`, complete))
}

/**
 * 어느 목록에 들어 있는지와 내용이 맞는지 봅니다.
 *
 * 끝난 시상식에 시상 시각이 없으면 백엔드가 저장을 거부하므로, 관리 화면에서 미리 걸러 냅니다.
 */
function checkListed(ceremony: AwardCeremony, where: string, complete: boolean): AwardCeremony {
  if (ceremony.complete !== complete) {
    throw new ConfigError(
      AWARDS_CONFIG,
      `${where} 의 isAwardCeremonyComplete 는 ${complete} 여야 합니다 (${ceremony.id})`,
    )
  }
  if (complete && ceremony.ceremonyTime === null) {
    throw new ConfigError(
      AWARDS_CONFIG,
      `${where} (${ceremony.year}년 ${ceremony.month}월) 은 끝난 시상식이므로 시상 일시가 있어야 합니다`,
    )
  }
  return ceremony
}

/**
 * 설정 원본 전체를 읽습니다.
 *
 * 끝난 회차와 예정된 회차가 각각 다른 항목으로 오므로, 어느 목록에서 왔는지로 구분합니다
 * (예전에는 플래그 하나로 섞여 있었습니다).
 */
export function parseAwardData(payload: unknown): AwardData {
  if (!isRecord(payload)) {
    throw new ConfigError(AWARDS_CONFIG, '시상식 설정은 객체여야 합니다 (awardCeremonies 등을 담은)')
  }

  const complete = parseList(payload.awardCeremonies, 'awardCeremonies', true)
  const pending = parseList(payload.awardCeremoniesPending, 'awardCeremoniesPending', false)
  /*
   * 올해의 언론인상은 열렸는지에 따라 두 모양 중 하나이므로, 어느 목록에서 왔는지로는 알 수 없습니다.
   * 여기서는 항목 자신의 isAwardCeremonyComplete 를 그대로 믿고, 끝났다면 시각이 있는지만 봅니다.
   */
  const rawOfTheYear = payload.awardCeremonyOfTheYear
  const parsedOfTheYear =
    rawOfTheYear === undefined || rawOfTheYear === null
      ? null
      : parseEntry(rawOfTheYear, 'awardCeremonyOfTheYear', true)
  const ofTheYear = parsedOfTheYear
    ? checkListed(parsedOfTheYear, 'awardCeremonyOfTheYear', parsedOfTheYear.complete)
    : null

  const monthly = [...complete, ...pending].sort(byNewestFirst)
  return {
    monthly,
    ofTheYear,
    all: (ofTheYear ? [ofTheYear, ...monthly] : monthly).sort(byNewestFirst),
  }
}

/**
 * 모든 회차 (끝난 것 + 예정된 것 + 올해의 언론인상), 최신순. 일정표에서 씁니다.
 */
export function parseAllAwardCeremonies(payload: unknown): AwardCeremony[] {
  return parseAwardData(payload).all
}

/** 시상식이 끝나 수상자를 보여 줄 수 있는 회차만, 최신순. 우리말 수상자 화면에서 씁니다. */
export function parseAwardCeremonies(payload: unknown): AwardCeremony[] {
  return parseAllAwardCeremonies(payload).filter((ceremony) => ceremony.complete)
}

/** 시상식 부문 이름들을 '기자 · 피디 · 아나운서 부문' 형태로 합칩니다. */
export function sectionSummary(ceremony: AwardCeremony): string {
  const names = ceremony.sections.map((section) => section.section)
  return names.length > 0 ? `${names.join(' · ')} 부문` : '부문 정보 준비 중'
}

const SEOUL = 'Asia/Seoul'

function parts(time: number, options: Intl.DateTimeFormatOptions) {
  const found = new Intl.DateTimeFormat('ko-KR', { timeZone: SEOUL, ...options }).formatToParts(time)
  return (type: Intl.DateTimeFormatPartTypes) =>
    found.find((part) => part.type === type)?.value ?? ''
}

/** Short date for list view (ex. 2026.08.24) */
export function formatShortDate(time: number | null): string | null {
  if (time == null) return null
  const pick = parts(time, { year: 'numeric', month: '2-digit', day: '2-digit' })
  return `${pick('year')}.${pick('month')}.${pick('day')}`
}

/** Long date for detail view (ex. 2026. 8. 24. (월) 11:00) */
export function formatLongDate(time: number | null): string | null {
  if (time == null) return null
  const day = parts(time, { year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' })
  const clock = parts(time, { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${day('year')}. ${day('month')}. ${day('day')}. (${day('weekday')}) ${clock('hour')}:${clock('minute')}`
}
