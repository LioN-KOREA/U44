import { useEffect, useState } from 'react'
import { loadConfig, peekConfig } from '../data/config'

export interface ConfigState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

/** 원본을 검사·정리합니다. 형식 오류는 화면에 띄우고 개발자 도구에도 남깁니다. */
function parseSafely<T>(name: string, raw: unknown, parse: (raw: unknown) => T): ConfigState<T> {
  try {
    return { data: parse(raw), loading: false, error: null }
  } catch (error) {
    console.error(error)
    const message = error instanceof Error ? error.message : `${name}.json 을 읽지 못했습니다.`
    return { data: null, loading: false, error: message }
  }
}

/**
 * `/configs/<name>.json` 을 불러와 `parse` 로 검사한 결과를 돌려줍니다.
 *
 * `parse` 는 모듈 최상위에 정의한 함수를 넘겨 주세요 (렌더마다 새로 만들면 다시 불러옵니다).
 * `name` 은 한 호출 위치에서 바뀌지 않는다고 가정합니다.
 */
export function useConfig<T>(name: string, parse: (raw: unknown) => T): ConfigState<T> {
  // 이미 받아 둔 설정이면 첫 화면부터 바로 씁니다.
  const [state, setState] = useState<ConfigState<T>>(() => {
    const cached = peekConfig(name)
    return cached === undefined
      ? { data: null, loading: true, error: null }
      : parseSafely(name, cached, parse)
  })

  useEffect(() => {
    if (peekConfig(name) !== undefined) return
    let active = true

    loadConfig(name)
      .then((raw) => {
        if (active) setState(parseSafely(name, raw, parse))
      })
      .catch((error: unknown) => {
        if (!active) return
        console.error(error)
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error.message : `${name}.json 을 불러오지 못했습니다.`,
        })
      })

    return () => {
      active = false
    }
  }, [name, parse])

  return state
}
