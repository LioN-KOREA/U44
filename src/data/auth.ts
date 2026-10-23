import { apiBaseUrl } from './config'

/**
 * 라이온코리아 계정관리 시스템(OpenID Connect) 로그인의 브라우저 쪽.
 *
 * 브라우저는 토큰 교환을 하지 않습니다. 코드 교환과 갱신은 백엔드(/api/auth/*)가 하고, 리프레시
 * 토큰은 백엔드에만 남습니다 (연동 안내서 §2). 브라우저가 받는 것은 5분짜리 접근 토큰(메모리에만
 * 둡니다)과, 백엔드가 심는 HttpOnly 세션 쿠키뿐입니다. 쿠키는 자바스크립트로 읽을 수 없으므로 XSS 가
 * 있어도 세션을 통째로 가져갈 수 없습니다.
 *
 *   로그인   : /api/auth/login 으로 이동 → 계정 시스템 로그인 화면 → /manage?code=…&state=… 로 복귀
 *   마무리   : 그 주소의 쿼리를 /api/auth/session 에 넘겨 세션을 엽니다
 *   갱신     : /api/auth/refresh. 새로 고친 페이지도 이것으로 로그인 상태를 되찾습니다
 *   로그아웃 : /api/auth/logout 이 알려 주는 계정 시스템의 /logout 으로 이동 (SSO 세션까지 종료)
 */

const AUTH_BASE = `${apiBaseUrl}/api/auth`

/** 로그인한 계정. 백엔드가 계정 시스템에서 읽어 알려 줍니다. */
export interface AuthUser {
  /** 계정 ID. 바뀌지 않는 유일한 식별자입니다. */
  sub: string
  email: string
  name: string
  /**
   * 관리 화면을 쓸 권한이 있는지. 화면을 고르는 데만 씁니다 — 관리 API 는 요청마다 서버가 다시
   * 확인합니다.
   */
  canManage: boolean
}

export interface AuthSession {
  accessToken: string
  /** 접근 토큰이 만료되는 시각 (밀리초). */
  expiresAt: number
  user: AuthUser
}

/**
 * 로그인·갱신이 실패한 이유.
 *
 * `sessionEnded` 는 되돌릴 수 없는 상태입니다 (만료, 폐기, 다른 곳에서 로그아웃). 다시 시도하지
 * 말고 다시 로그인하게 해야 합니다. 그 밖의 실패(서버·네트워크 오류)는 잠시 뒤 다시 시도할 만합니다.
 */
export class AuthError extends Error {
  readonly status: number
  readonly sessionEnded: boolean

  constructor(status: number, message: string, sessionEnded = false) {
    super(message)
    this.name = 'AuthError'
    this.status = status
    this.sessionEnded = sessionEnded
  }
}

function isSession(value: unknown): value is AuthSession {
  const v = value as AuthSession | null
  return (
    typeof v?.accessToken === 'string' &&
    typeof v.expiresAt === 'number' &&
    typeof v.user?.sub === 'string' &&
    typeof v.user.canManage === 'boolean'
  )
}

/*
 * 세션 쿠키를 함께 보냅니다. 배포본에서는 사이트와 API 가 같은 출처라 기본값으로도 가지만, 개발
 * 서버처럼 출처가 다를 때도 같은 코드가 동작하도록 'include' 로 둡니다.
 */
async function post(path: string, body?: unknown): Promise<Response> {
  return fetch(`${AUTH_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
}

/** 계정 시스템 로그인으로 보냅니다. 페이지를 떠나는 이동이라 돌아오지 않습니다. */
export function beginLogin(): void {
  window.location.assign(`${AUTH_BASE}/login`)
}

/** 계정 시스템이 돌려보낸 주소(/manage?…)가 로그인의 마지막 단계인지. */
export function isLoginCallback(search: string): boolean {
  const params = new URLSearchParams(search)
  return params.has('code') || params.has('error')
}

/** 계정 시스템이 돌려준 오류 코드를 사용자에게 보여 줄 문구로 바꿉니다. */
function callbackErrorMessage(code: string): string {
  switch (code) {
    case 'access_denied':
      return '로그인이 취소되었습니다.'
    case 'temporarily_unavailable':
      return '계정 시스템에 연결하지 못했습니다. 잠시 뒤에 다시 시도해 주세요.'
    case 'invalid_client':
      return '이 사이트의 로그인 설정이 계정 시스템에 허용되어 있지 않습니다. 관리자에게 문의해 주세요.'
    default:
      return '로그인하지 못했습니다. 다시 시도해 주세요.'
  }
}

/**
 * 로그인의 마지막 단계: 돌아온 주소의 쿼리를 백엔드에 넘겨 세션을 엽니다.
 *
 * code 와 state 를 검증하고 교환하는 일은 백엔드가 합니다 (state 가 이 브라우저가 받은 것과 다르면
 * 거절됩니다). 계정 시스템이 오류를 돌려보냈으면 백엔드에 갈 것도 없이 그 문구를 보여 줍니다.
 */
export async function completeLogin(search: string): Promise<AuthSession> {
  const error = new URLSearchParams(search).get('error')
  if (error) throw new AuthError(400, callbackErrorMessage(error), true)

  const response = await post('/session', { callback: search })
  if (!response.ok) {
    throw new AuthError(
      response.status,
      response.status >= 500
        ? '계정 시스템에 연결하지 못했습니다. 잠시 뒤에 다시 시도해 주세요.'
        : '로그인을 마무리하지 못했습니다. 다시 시도해 주세요.',
      response.status < 500,
    )
  }
  const session: unknown = await response.json()
  if (!isSession(session)) throw new AuthError(500, '로그인 응답을 읽지 못했습니다.')
  return session
}

/**
 * 지금 세션의 접근 토큰. 만료가 가까우면 백엔드가 갱신해서 돌려줍니다.
 *
 * 로그인한 적이 없거나 세션이 끝났으면 null 입니다.
 */
export async function refreshSession(): Promise<AuthSession | null> {
  const response = await post('/refresh')
  if (response.status === 401) return null
  if (!response.ok) {
    throw new AuthError(response.status, '로그인 상태를 확인하지 못했습니다. 잠시 뒤에 다시 시도해 주세요.')
  }
  const session: unknown = await response.json()
  if (!isSession(session)) throw new AuthError(500, '로그인 응답을 읽지 못했습니다.')
  return session
}

/**
 * 로그아웃.
 *
 * 이 사이트의 세션을 지운 다음, 계정 시스템의 /logout 으로 이동합니다. 우리 쪽만 지우면 SSO 세션이
 * 남아 다음 로그인 때 곧바로 다시 들어가지므로, 로그아웃이 동작하지 않는 것처럼 보입니다 (§4.5).
 * 계정 시스템은 로그아웃을 마치면 사이트 첫 화면으로 돌려보냅니다.
 */
export async function logout(): Promise<void> {
  const response = await post('/logout')
  if (!response.ok) throw new AuthError(response.status, '로그아웃하지 못했습니다. 다시 시도해 주세요.')
  const body = (await response.json()) as { logoutUrl?: unknown }
  if (typeof body.logoutUrl !== 'string') throw new AuthError(500, '로그아웃 응답을 읽지 못했습니다.')
  window.location.assign(body.logoutUrl)
}
