import { parseAwardData, type AwardCeremony, type AwardData } from './awards'

/**
 * 시상식 일정.
 *
 * 일정은 따로 두지 않고 시상식 설정에서 만듭니다. 시상식 하나가 한 회차이고,
 * 끝난 회차든 예정된 회차든 모두 일정표에 나옵니다 (수상자 화면에는 끝난 회차만 나옵니다).
 * 그래서 날짜·장소를 고칠 곳은 관리 화면 한 군데뿐입니다.
 *
 * '올해의 언론인상' 은 설정의 awardCeremonyOfTheYear 항목 하나가 정합니다.
 * 예전에는 '12월에 열리는 시상식' 이라는 규칙으로 골랐지만, 그 시상식이 다른 달로 미뤄질 수도 있어
 * 달과 무관한 별도 항목으로 바뀌었습니다. 항목이 없어도 카드는 그대로 보여 주고, 일정 자리에만
 * 아무것도 적지 않습니다.
 */

/** 일정이 정해지지 않은 회차에 보여 줄 문구. */
export const SCHEDULE_TBD = '일정 추후 안내'

/** 날짜는 정해졌지만 장소가 아직인 회차에 덧붙이는 문구. */
export const VENUE_TBD = '장소 추후 안내'

/** 올해의 언론인상 회차가 아직 없을 때 달 자리에 보여 줄 문구. */
const ANNUAL_MONTH_UNKNOWN = '올해의 시상식'

const AWARD_TITLES = {
  monthly: '쉽고 바른 우리말 이달의 언론인상',
  annual: '쉽고 바른 우리말 올해의 언론인상',
} as const

export interface Ceremony {
  month: number
  /** 확정된 시각. 아직 정해지지 않았으면 null. */
  dateTime: Date | null
  venue: string | null
}

export interface AwardSchedule {
  /** 화면에서 카드 모양·아이콘을 고르는 데 쓰는 식별자 ('monthly' | 'annual'). */
  id: 'monthly' | 'annual'
  title: string
  ceremonies: Ceremony[]
}

export interface Schedules {
  year: number
  awards: AwardSchedule[]
}

const SEOUL = 'Asia/Seoul'

/** 서울 시각 기준으로 날짜 조각을 꺼냅니다. */
function seoulParts(date: Date) {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: SEOUL,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return {
    year: Number(pick('year')),
    month: Number(pick('month')),
    day: Number(pick('day')),
    weekday: pick('weekday'),
    hour: Number(pick('hour')),
    minute: Number(pick('minute')),
  }
}

/**
 * 일정표 한 회차의 재료.
 *
 * 일정은 두 곳에서 올 수 있습니다: 시상식 설정(기본), 또는 홈 화면 설정에 따로 적어 둔 일정.
 * 어느 쪽이든 이 모양으로 모은 다음 같은 규칙으로 일정표를 만들어, 출처에 따라 화면이 달라지지
 * 않게 합니다.
 */
export interface ScheduleEntry {
  year: number
  month: number
  /** 확정된 시각 (밀리초). 아직 정해지지 않았으면 null. */
  time: number | null
  /** 장소. 아직 정해지지 않았으면 빈 문자열. */
  location: string
  /** '올해의 언론인상' 회차인지. */
  ofTheYear: boolean
}

const thisYearInSeoul = () =>
  Number(new Intl.DateTimeFormat('en-US', { timeZone: SEOUL, year: 'numeric' }).format(new Date()))

/** 시상식 설정을 일정 재료로 바꿉니다. */
export function awardDataToEntries(data: AwardData): ScheduleEntry[] {
  const toEntry = (ceremony: AwardCeremony): ScheduleEntry => ({
    year: ceremony.year,
    month: ceremony.month,
    time: ceremony.ceremonyTime,
    location: ceremony.location,
    ofTheYear: ceremony.ofTheYear,
  })
  return [...data.monthly.map(toEntry), ...(data.ofTheYear ? [toEntry(data.ofTheYear)] : [])]
}

/** 일정표가 보여 주는 해: 적힌 회차 중 가장 최근 연도. 회차가 없으면 올해. */
function scheduleYear(entries: readonly ScheduleEntry[]): number {
  return entries.length > 0 ? Math.max(...entries.map((entry) => entry.year)) : thisYearInSeoul()
}

/** 일정표에 실제로 나오는 회차들 (가장 최근 연도의 것만). */
export function entriesShownOnSchedule(entries: readonly ScheduleEntry[]): ScheduleEntry[] {
  const year = scheduleYear(entries)
  return entries.filter((entry) => entry.year === year)
}

const toCeremony = (entry: ScheduleEntry): Ceremony => ({
  month: entry.month,
  dateTime: entry.time === null ? null : new Date(entry.time),
  venue: entry.location || null,
})

/**
 * 일정 재료로 일정표를 만듭니다.
 * 가장 최근 연도의 회차들을 달 순서대로 이달의/올해의 언론인상으로 나눕니다.
 */
export function buildSchedulesFromEntries(entries: readonly ScheduleEntry[]): Schedules {
  const year = scheduleYear(entries)
  const shown = entries.filter((entry) => entry.year === year)

  const monthly = shown
    .filter((entry) => !entry.ofTheYear)
    .sort((a, b) => a.month - b.month)
    .map(toCeremony)

  const ofTheYear = shown.find((entry) => entry.ofTheYear)
  const annual = ofTheYear ? [toCeremony(ofTheYear)] : []

  const groups: AwardSchedule[] = [
    { id: 'monthly', title: AWARD_TITLES.monthly, ceremonies: monthly },
    // 올해의 언론인상 카드는 회차가 아직 없어도 남겨 둡니다. 시상 자체는 예정되어 있고,
    // 카드가 사라지면 상이 없어진 것처럼 보입니다.
    { id: 'annual', title: AWARD_TITLES.annual, ceremonies: annual },
  ]

  return {
    year,
    awards: groups.filter((group) => group.id === 'annual' || group.ceremonies.length > 0),
  }
}

export function buildSchedules(data: AwardData): Schedules {
  return buildSchedulesFromEntries(awardDataToEntries(data))
}

/** 설정 원본으로 바로 일정표를 만듭니다 (useConfig 에 넘기는 용도). */
export function parseAwardSchedule(raw: unknown): Schedules {
  return buildSchedules(parseAwardData(raw))
}

export function findAward(schedules: Schedules, id: AwardSchedule['id']): AwardSchedule | undefined {
  return schedules.awards.find((award) => award.id === id)
}

/* ---------- 화면에 쓰는 문구 만들기 ---------- */

/** '오전 11시', '오후 2시 30분' */
function formatClock(hour: number, minute: number): string {
  const period = hour < 12 ? '오전' : '오후'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${period} ${h12}시${minute ? ` ${minute}분` : ''}`
}

function withVenue(text: string, venue: string | null): string {
  return venue ? `${text} · ${venue}` : text
}

/**
 * 홈 카드용 짧은 형태: '8.24.(월) 오전 11시 · 프레스센터 매화홀'
 *
 * 날짜가 없으면 장소가 있어도 '일정 추후 안내' 만 적습니다 (언제인지 모르는 장소는 안내가 되지
 * 않습니다). 날짜만 있으면 장소 자리에 '장소 추후 안내' 를 적습니다.
 */
export function formatCeremonyShort(ceremony: Ceremony | null): string {
  if (!ceremony?.dateTime) return SCHEDULE_TBD
  const p = seoulParts(ceremony.dateTime)
  return withVenue(
    `${p.month}.${p.day}.(${p.weekday}) ${formatClock(p.hour, p.minute)}`,
    ceremony.venue ?? VENUE_TBD,
  )
}

/** 시상식 안내용 긴 형태: '2026. 8. 24.(월) 오전 11시 · 프레스센터 매화홀' */
export function formatCeremonyLong(ceremony: Ceremony | null): string {
  if (!ceremony?.dateTime) return SCHEDULE_TBD
  const p = seoulParts(ceremony.dateTime)
  return withVenue(
    `${p.year}. ${p.month}. ${p.day}.(${p.weekday}) ${formatClock(p.hour, p.minute)}`,
    ceremony.venue,
  )
}

/**
 * '8월 ~ 11월 시상식' / '12월 시상식'.
 * 적힌 순서의 처음과 끝을 씁니다 (11월 → 1월처럼 해를 넘겨도 자연스럽게 읽히도록).
 *
 * 올해의 언론인상 회차가 아직 정해지지 않았으면 달을 알 수 없으므로 '올해의 시상식' 이라고만 씁니다.
 */
export function formatMonthRange(award: AwardSchedule): string {
  const months = award.ceremonies.map((ceremony) => ceremony.month)
  if (months.length === 0) return award.id === 'annual' ? ANNUAL_MONTH_UNKNOWN : '시상식'
  const first = months[0]
  const last = months[months.length - 1]
  return first === last ? `${first}월 시상식` : `${first}월 ~ ${last}월 시상식`
}

/** 일정표에 그릴 한 줄. */
export interface ScheduleRow {
  key: string
  /** 달 표시 ('12월'). 회차가 아직 없으면 빈 문자열입니다. */
  month: string
  /** 회차. 아직 없으면 null 이고, 일정 자리에는 '일정 추후 안내' 가 들어갑니다. */
  ceremony: Ceremony | null
}

/**
 * 묶음 하나를 일정표의 줄들로 바꿉니다.
 *
 * 회차가 하나도 없는 올해의 언론인상 카드도 빈 채로 두지 않고 한 줄을 그립니다. 달은 정해지지
 * 않았으니 비워 두고, 일정 자리에만 '일정 추후 안내' 를 적습니다.
 */
export function scheduleRows(award: AwardSchedule): ScheduleRow[] {
  if (award.ceremonies.length > 0) {
    return award.ceremonies.map((ceremony) => ({
      key: String(ceremony.month),
      month: `${ceremony.month}월`,
      ceremony,
    }))
  }
  return [{ key: `${award.id}-tbd`, month: '', ceremony: null }]
}
