import type { ComponentType } from 'react'
import ExemplaryCaseJul2026 from '../pages/exemplaryCases/ExemplaryCaseJul2026'
import ExemplaryCaseAug2026 from '../pages/exemplaryCases/ExemplaryCaseAug2026'

/**
 * The list of the exemplary Korean language use cases.
 *
 * 시상식 설정과 달리 회차마다 담기는 내용의 형태가 제각각이라
 * 하나의 틀로 찍어 낼 수 없습니다. 그래서 목록에 필요한 최소한의 정보만
 * 여기에 적어 두고, 본문은 회차마다 따로 만든 컴포넌트가 통째로 그립니다.
 *
 * 새 회차를 추가하려면:
 *   1) `src/pages/exemplaryCases/` 에 그 달 전용 컴포넌트를 만들고
 *   2) 아래 배열에 한 줄 추가하면 끝입니다.
 */
export interface ExemplaryCase {
  /** 주소 해시에 쓰이는 식별자 (예: '2026-07'). */
  id: string
  year: number
  month: number
  /** 목록과 상세 머리말에 쓰일 제목. */
  title: string
  /** 그 달의 본문을 통째로 그리는 컴포넌트. */
  Component: ComponentType
}

export const EXEMPLARY_CASES: readonly ExemplaryCase[] = [
  {
    id: '2026-07',
    year: 2026,
    month: 7,
    title: '2026년 7월 쉽고 바른 우리말 우수사례',
    Component: ExemplaryCaseJul2026,
  },
  {
    id: '2026-08',
    year: 2026,
    month: 8,
    title: '2026년 8월 쉽고 바른 우리말 우수사례',
    Component: ExemplaryCaseAug2026,
  },
]

/** 최신 회차가 먼저 오도록 정렬한 목록. */
export const EXEMPLARY_CASES_LATEST_FIRST: readonly ExemplaryCase[] = [...EXEMPLARY_CASES].sort(
  (a, b) => b.year - a.year || b.month - a.month,
)

export function findExemplaryCase(id: string | null): ExemplaryCase | null {
  if (!id) return null
  return EXEMPLARY_CASES.find((item) => item.id === id) ?? null
}
