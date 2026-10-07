/**
 * Methods for fetching the updatable configuration values
 * (`/configs/<itemName>.json`).
 *
 * Items that change from time to tie (posters, schedules, award winners, social media posts)
 * should be stored in a separate, updatable JSON file, and not be hardcoded.
 * This way, we can update those values without going through the hassle of
 * rebuilding & redeploying the app
 * 
 * Those values may be stored in a static JSON file, or fetched from an API endpoint.
 * Moving from one to another shouldn't be that much of a difficulty, since the data is
 * served in a JSON format, regardless of where it is from.
 * Just update the configUrl function below as the source changes.
 *
 *  - Fetched values are cached, so one request is enough for all pages.
 *  - Once an item is fetched, it is reused even when the user leaves & returns to the same page.
 *  - The format of the JSON data is validated when each page is loaded, since there may be rare occasions where
 *    a JSON file is corrupted.
 */

/**
 * Where each configuration item comes from.
 *
 * `api` items are served by the U44 backend, which also rewrites every image reference into a full
 * CloudFront URL, so the pages can use those values as they are.
 * `static` items would be plain JSON files under public/configs; nothing uses that any more, but the
 * kind is kept because it costs nothing and a future config may start out that way.
 *
 * The API base URL is supplied at build time through VITE_API_BASE_URL (see .env.example).
 * None of these have a static copy: they are edited through the 관리 screen and served by the
 * backend, so a build with no VITE_API_BASE_URL reports them as unavailable rather than showing
 * something stale. The one exception is the home screen, which falls back to HOMESCREEN_DEFAULT
 * (see data/homescreen.ts) so the landing page is never left with a hole in the middle.
 */
type ConfigSource =
  | { kind: 'api'; path: string }
  | { kind: 'static' }

const CONFIG_SOURCES: Record<string, ConfigSource> = {
  awards: { kind: 'api', path: '/api/v0/award-info' },
  homescreen: { kind: 'api', path: '/api/v0/homescreen' },
  socialMedia: { kind: 'api', path: '/api/v0/social-media-posts' },
}

/** 정적 파일이 없는 설정. 백엔드가 없으면 불러올 곳이 없습니다. */
function isApiOnly(name: string): boolean {
  return CONFIG_SOURCES[name]?.kind === 'api'
}

/** The API base URL, without a trailing slash. Empty when no backend is configured. */
export const apiBaseUrl: string = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

export function configUrl(name: string): string {
  const source = CONFIG_SOURCES[name]
  if (source?.kind === 'api' && apiBaseUrl) return `${apiBaseUrl}${source.path}`
  return `/configs/${name}.json`
}

/** 진행 중이거나 끝난 요청. 같은 설정을 동시에 여러 번 요청하지 않도록 공유합니다. */
const pending = new Map<string, Promise<unknown>>()
/** 이미 받아 둔 원본 값. 화면에 다시 들어올 때 '불러오는 중' 없이 바로 쓰기 위함입니다. */
const resolved = new Map<string, unknown>()

/** 설정 원본(JSON)을 받아 옵니다. 실패한 요청은 캐시에서 빼서 다음에 다시 시도합니다. */
export function loadConfig(name: string): Promise<unknown> {
  /*
   * 시상식 정보는 관리 화면에서 고치고 백엔드가 내려 주므로 정적 파일이 없습니다.
   * 주소가 비어 있으면 404 대신 이유를 분명히 알려 줍니다 (SPA 설정 때문에 없는 파일도 200 이
   * 올 수 있어, 그냥 요청하면 'JSON 문법 오류'처럼 보입니다).
   */
  if (isApiOnly(name) && !apiBaseUrl) {
    return Promise.reject(
      new Error(`${name} 설정을 받아 올 주소가 없습니다. VITE_API_BASE_URL 을 설정해 주세요.`),
    )
  }

  const url = configUrl(name)
  let request = pending.get(url)

  if (!request) {
    request = fetch(url).then(async (response) => {
      if (!response.ok) {
        throw new Error(`${name}.json 을 불러오지 못했습니다 (HTTP ${response.status})`)
      }
      /*
       * 주소(React Router)를 쓰려면 서버가 모르는 경로에 index.html 을 돌려주도록 설정하는데,
       * 그러면 없는 설정 파일을 요청해도 404 대신 웹 페이지가 200 으로 옵니다.
       * 그대로 두면 'JSON 문법 오류'로 보여 원인을 헷갈리게 하므로 여기서 구분합니다.
       */
      if (response.headers.get('content-type')?.includes('text/html')) {
        throw new Error(`${name}.json 파일을 찾을 수 없습니다 (${url})`)
      }
      // 본문을 글자로 먼저 받아, 빈 응답과 문법 오류를 구분해 알려 줍니다.
      const text = (await response.text()).trim()
      if (text === '') {
        throw new Error(`${name} 설정이 비어 있습니다 (${url})`)
      }
      let data: unknown
      try {
        data = JSON.parse(text)
      } catch (error) {
        // 쉼표 누락 같은 문법 오류는 어느 파일인지부터 알려 줍니다.
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(`${name} 설정의 JSON 문법이 올바르지 않습니다: ${detail}`)
      }
      resolved.set(url, data)
      return data
    })
    request.catch(() => pending.delete(url))
    pending.set(url, request)
  }

  return request
}

/** Return if there is a cached configuration value. 
 * If it doesn't exist, return undefined. */
export function peekConfig(name: string): unknown {
  return resolved.get(configUrl(name))
}

/** 설정 파일 형식이 기대와 다를 때 던지는 오류. 어느 파일의 어느 항목인지 알려 줍니다. */
export class ConfigError extends Error {
  /*
   * API 로 받아 오는 설정에는 이제 대응하는 .json 파일이 없으므로, 이름만 적습니다
   * ('awards.json 형식이…' 라고 하면 찾을 수 없는 파일을 가리키게 됩니다).
   */
  constructor(name: string, detail: string) {
    const where = CONFIG_SOURCES[name]?.kind === 'api' ? `${name} 설정` : `${name}.json`
    super(`${where} 형식이 올바르지 않습니다: ${detail}`)
    this.name = 'ConfigError'
  }
}

/* ---------- Utilites used for object validation ---------- */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Extract a required string item from an object. 
 * If such item doesn't exist, return null. 
 * If it does exist but is not a string, throw a ConfigError. 
 * */
export function requireString(
  name: string,
  record: Record<string, unknown>,
  key: string,
  where: string,
): string {
  const value = record[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ConfigError(name, `${where}.${key} 는 비어 있지 않은 문자열이어야 합니다`)
  }
  return value
}

/** Extract an optional string item from an object. 
 * If such item doesn't exist or is an empty string, return null. 
 * If it does exist but is not a string, throw a ConfigError. 
 * */
export function optionalString(
  name: string,
  record: Record<string, unknown>,
  key: string,
  where: string,
): string | null {
  const value = record[key]
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') {
    throw new ConfigError(name, `${where}.${key} 는 문자열이어야 합니다`)
  }
  return value
}
