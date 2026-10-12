import { ConfigError, isRecord } from './config'

/**
 * 외래어 → 우리말 개선 용어 목록 (`/api/v0/glossary`).
 *
 * 예전에는 2,500여 개의 낱말이 이 파일에 그대로 적혀 있었습니다 (150KB 넘는 소스). 이제는
 * 관리 화면에서 XLSX·CSV 를 올려 바꾸고, 백엔드가 설정으로 내려 줍니다 — 낱말 하나를 고치려고
 * 다시 배포할 일이 없습니다.
 */
export const GLOSSARY_CONFIG = 'glossary'

export interface TermPair {
  /** 바꾸기 전 말 (외래어·외국어). */
  original: string
  /** 권장하는 우리말. */
  recommended: string
}

export function parseGlossary(payload: unknown): TermPair[] {
  if (!isRecord(payload)) {
    throw new ConfigError(GLOSSARY_CONFIG, '최상위는 객체여야 합니다 (glossary 를 담은)')
  }
  if (!Array.isArray(payload.glossary)) {
    throw new ConfigError(GLOSSARY_CONFIG, 'glossary 는 배열이어야 합니다')
  }
  return payload.glossary
    .filter(isRecord)
    .map((item) => ({
      original: typeof item.original === 'string' ? item.original : '',
      recommended: typeof item.recommended === 'string' ? item.recommended : '',
    }))
    // 한쪽이라도 비어 있으면 화면에 보여 줄 것이 없습니다.
    .filter((item) => item.original !== '' && item.recommended !== '')
}

/** 관리 화면이 올리는 모양. */
export interface RawGlossaryConfig {
  lastUpdatedAt: number
  glossary: TermPair[]
}
