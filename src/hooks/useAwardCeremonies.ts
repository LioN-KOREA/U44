import { AWARDS_CONFIG, parseAwardCeremonies, type AwardCeremony } from '../data/awards'
import { useConfig } from './useConfig'

/** 불러오는 동안 쓸 빈 목록. 렌더마다 새 배열을 만들면 쓰는 쪽의 useMemo 가 매번 다시 계산됩니다. */
const NO_CEREMONIES: AwardCeremony[] = []

interface AwardsState {
  ceremonies: AwardCeremony[]
  loading: boolean
  error: string | null
}

/**
 * 시상식 설정(`/api/v0/award-info`)을 읽어 옵니다.
 * 다른 설정과 같은 캐시를 쓰므로, 목록과 상세를 오가도 다시 받지 않습니다.
 */
export function useAwardCeremonies(): AwardsState {
  const { data, loading, error } = useConfig(AWARDS_CONFIG, parseAwardCeremonies)
  return { ceremonies: data ?? NO_CEREMONIES, loading, error }
}
