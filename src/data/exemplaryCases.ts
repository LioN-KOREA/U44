import { ConfigError, isRecord } from './config'

/**
 * 우리말 우수사례 설정 (`/api/v0/exemplary-cases`).
 *
 * 회차마다 글은 달라도 짜임새는 같습니다. 그래서 칸마다 이름이 정해져 있고, 화면은 어느 칸을
 * 어떤 모양으로 그릴지 알고 있습니다 (ExemplaryCaseTemplate). 편집하는 쪽은 글과 낱말 짝만
 * 채우면 되고, 새 회차를 올리는 데 배포가 필요하지 않습니다.
 */
export const EXEMPLARY_CASES_CONFIG = 'exemplaryCases'

/** 왼쪽(쓰던 말) → 오른쪽(바꾼 말). */
export interface ExemplaryPair {
  from: string
  to: string
}

export interface ExemplarySection {
  title: string
  lead: string
  pairs: ExemplaryPair[]
}

/** 5번 칸: 아래에 설명 상자가 하나 더 붙습니다. */
export interface CarefulWordingSection extends ExemplarySection {
  noteTitle: string
  noteBody: string
}

/** 6번 칸: 맞춤법이 헷갈리는 짝을 따로 묶어 보여 줍니다. */
export interface BroadcastTermsSection extends ExemplarySection {
  spellingPairs: ExemplaryPair[]
}

/** 8번 칸: 두 묶음으로 나눠 놓는 안내 상자. */
export interface RecommendedSection {
  title: string
  calloutTitle: string
  lead: string
  groups: ExemplaryPair[][]
}

export interface ExemplaryCase {
  /** 주소에 쓰는 식별자 (예: '2026-08'). 연·월에서 만듭니다. */
  id: string
  year: number
  month: number
  /** 목록과 상세 머리말에 쓰일 제목. 연·월에서 만듭니다. */
  title: string
  lead: string
  sourceNote: string
  foreignToKorean: ExemplarySection
  plainerWording: ExemplarySection
  abbreviations: ExemplarySection
  glosses: ExemplarySection
  carefulWording: CarefulWordingSection
  broadcastTerms: BroadcastTermsSection
  settlingIn: ExemplarySection
  recommended: RecommendedSection
}

/** 관리 화면이 다루는 원본 모양. 연·월만 있고 id·제목은 없습니다. */
export interface RawExemplaryCase {
  exemplaryCaseYear: number
  exemplaryCaseMonth: number
  lead: string
  sourceNote: string
  foreignToKorean: ExemplarySection
  plainerWording: ExemplarySection
  abbreviations: ExemplarySection
  glosses: ExemplarySection
  carefulWording: CarefulWordingSection
  broadcastTerms: BroadcastTermsSection
  settlingIn: ExemplarySection
  recommended: RecommendedSection
}

export interface RawExemplaryCasesConfig {
  exemplaryCases: RawExemplaryCase[]
  exemplaryCasesConfigLastUpdated: number
}

/** 칸 하나를 만듭니다. 비어 있어도 화면이 깨지지 않도록 빈 값으로 채웁니다. */
function emptySection(title = ''): ExemplarySection {
  return { title, lead: '', pairs: [] }
}

export function emptyExemplaryCase(year: number, month: number): RawExemplaryCase {
  return {
    exemplaryCaseYear: year,
    exemplaryCaseMonth: month,
    lead: '',
    sourceNote: '',
    foreignToKorean: emptySection('익숙한 외국어·외래어 대신 우리말로'),
    plainerWording: emptySection('어려운 표현을 쉽고 자연스럽게'),
    abbreviations: emptySection('약어와 전문용어는 알기 쉽게'),
    glosses: emptySection('한 단어 대신 뜻을 풀어 쓴 표현'),
    carefulWording: { ...emptySection('보다 정확하고 신중한 표현'), noteTitle: '', noteBody: '' },
    broadcastTerms: { ...emptySection('방송 속 우리말 & 바른 표현'), spellingPairs: [] },
    settlingIn: emptySection('우리말로 자리 잡아 가는 표현'),
    recommended: { title: '앞으로 눈여겨볼 우리말 표현', calloutTitle: '적극 권장 순화어', lead: '', groups: [] },
  }
}

const str = (record: Record<string, unknown>, key: string): string =>
  typeof record[key] === 'string' ? (record[key] as string) : ''

function readPairs(value: unknown): ExemplaryPair[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isRecord)
    .map((pair) => ({ from: str(pair, 'from'), to: str(pair, 'to') }))
}

function readSection(value: unknown, where: string): ExemplarySection {
  if (!isRecord(value)) throw new ConfigError(EXEMPLARY_CASES_CONFIG, `${where} 는 객체여야 합니다`)
  return { title: str(value, 'title'), lead: str(value, 'lead'), pairs: readPairs(value.pairs) }
}

function readCase(raw: unknown, where: string): ExemplaryCase {
  if (!isRecord(raw)) throw new ConfigError(EXEMPLARY_CASES_CONFIG, `${where} 는 객체여야 합니다`)
  const year = raw.exemplaryCaseYear
  const month = raw.exemplaryCaseMonth
  if (typeof year !== 'number' || !Number.isInteger(year)) {
    throw new ConfigError(EXEMPLARY_CASES_CONFIG, `${where}.exemplaryCaseYear 는 정수여야 합니다`)
  }
  if (typeof month !== 'number' || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new ConfigError(EXEMPLARY_CASES_CONFIG, `${where}.exemplaryCaseMonth 는 1~12 사이의 정수여야 합니다`)
  }

  const careful = isRecord(raw.carefulWording) ? raw.carefulWording : {}
  const broadcast = isRecord(raw.broadcastTerms) ? raw.broadcastTerms : {}
  const recommended = isRecord(raw.recommended) ? raw.recommended : {}

  return {
    id: `${year}-${String(month).padStart(2, '0')}`,
    year,
    month,
    title: `${year}년 ${month}월 쉽고 바른 우리말 우수사례`,
    lead: str(raw, 'lead'),
    sourceNote: str(raw, 'sourceNote'),
    foreignToKorean: readSection(raw.foreignToKorean, `${where}.foreignToKorean`),
    plainerWording: readSection(raw.plainerWording, `${where}.plainerWording`),
    abbreviations: readSection(raw.abbreviations, `${where}.abbreviations`),
    glosses: readSection(raw.glosses, `${where}.glosses`),
    carefulWording: {
      ...readSection(raw.carefulWording, `${where}.carefulWording`),
      noteTitle: str(careful, 'noteTitle'),
      noteBody: str(careful, 'noteBody'),
    },
    broadcastTerms: {
      ...readSection(raw.broadcastTerms, `${where}.broadcastTerms`),
      spellingPairs: readPairs(broadcast.spellingPairs),
    },
    settlingIn: readSection(raw.settlingIn, `${where}.settlingIn`),
    recommended: {
      title: str(recommended, 'title'),
      calloutTitle: str(recommended, 'calloutTitle') || '적극 권장 순화어',
      lead: str(recommended, 'lead'),
      groups: Array.isArray(recommended.groups) ? recommended.groups.map(readPairs) : [],
    },
  }
}

/** 최신 회차가 먼저 오도록 정렬한 목록. */
export function parseExemplaryCases(payload: unknown): ExemplaryCase[] {
  if (!isRecord(payload)) {
    throw new ConfigError(EXEMPLARY_CASES_CONFIG, '최상위는 객체여야 합니다 (exemplaryCases 를 담은)')
  }
  if (!Array.isArray(payload.exemplaryCases)) {
    throw new ConfigError(EXEMPLARY_CASES_CONFIG, 'exemplaryCases 는 배열이어야 합니다')
  }
  return payload.exemplaryCases
    .map((item, index) => readCase(item, `exemplaryCases[${index}]`))
    .sort((a, b) => b.year - a.year || b.month - a.month)
}

export function findExemplaryCase(cases: readonly ExemplaryCase[], id: string | null): ExemplaryCase | null {
  if (!id) return null
  return cases.find((item) => item.id === id) ?? null
}
