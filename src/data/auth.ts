/**
 * 라이온코리아 IT 서비스 계정관리 시스템 연동 (reference.md 기준).
 *
 * 주소는 모두 상대 경로(`/lpx/...`)입니다. 우리 배포(CloudFront)와 개발 서버(Vite) 모두
 * `/lpx/*` 를 계정관리 시스템으로 그대로 넘겨 주도록 해 두었기 때문에, 브라우저가 보기에는
 * 같은 출처입니다. 그래서 CORS 예비 요청이 없고, 갱신 쿠키도 서드파티 쿠키가 아닙니다.
 *
 * 토큰은 모두 메모리에만 둡니다. localStorage·sessionStorage 에 넣으면 페이지에 XSS 가 한 번만
 * 생겨도 그대로 읽히기 때문입니다 (reference.md: "Tokens live in memory only").
 */

/** 이 앱의 앱 클라이언트. 비밀값이 아니며, 모든 /lpx/auth 호출에 붙습니다. */
const CLIENT_ID = 'falm03vg6r35htb27ctg7rjda'

/** 관리 화면을 열 수 있는 권한 id. 이름이 아니라 id 로 확인합니다 (이름은 바뀔 수 있습니다). */
export const MANAGE_AUTHORITY_ID = '519093fd-d789-4853-b117-45187186ccb3'

const AUTH_BASE = '/lpx/auth'
const CLIENT_QUERY = `?clientId=${CLIENT_ID}`

/** 로그인 뒤 손에 쥐는 것. 모두 메모리에만 있습니다. */
export interface AuthSession {
  accessToken: string
  idToken: string
  /** 갱신 쿠키와 짝을 이루는 값. 갱신할 때마다 새로 발급되므로 매번 바꿔 두어야 합니다. */
  secToken: string
  /** 접근 토큰이 만료되는 시각 (밀리초). */
  expiresAt: number
}

/** `/lpx/auth/userInfo` 가 돌려주는 계정 정보. 필요한 것만 적어 둡니다. */
export interface AuthUserInfo {
  lkAccountSub: string
  lkAccountEmail: string
  lkAccountName: string
  lkAccountRole: string
  authorities: string[]
}

/**
 * 로그인·갱신이 실패한 이유.
 *
 * `sessionInvalid` 는 되돌릴 수 없는 상태입니다 (갱신 토큰이 이미 회전되었거나 짝이 맞지 않아
 * 세션이 통째로 폐기된 경우). 이때는 다시 시도하지 말고 로그아웃시켜야 합니다.
 */
export class AuthError extends Error {
  readonly status: number
  readonly sessionInvalid: boolean

  constructor(status: number, message: string, sessionInvalid = false) {
    super(message)
    this.name = 'AuthError'
    this.status = status
    this.sessionInvalid = sessionInvalid
  }
}

interface TokenPayload {
  accessToken?: unknown
  idToken?: unknown
  secToken?: unknown
  expiresIn?: unknown
}

/** 응답 본문은 항상 `{ status, message, data }` 입니다. */
async function readBody(response: Response): Promise<{ message: string; data: unknown }> {
  try {
    const body = (await response.json()) as { message?: unknown; data?: unknown }
    return {
      message: typeof body.message === 'string' ? body.message : '',
      data: body.data ?? null,
    }
  } catch {
    return { message: '', data: null }
  }
}

function toSession(data: unknown, where: string): AuthSession {
  const payload = (data ?? {}) as TokenPayload
  const { accessToken, idToken, secToken, expiresIn } = payload
  if (typeof accessToken !== 'string' || typeof idToken !== 'string' || typeof secToken !== 'string') {
    throw new AuthError(500, `${where} 응답에 토큰이 없습니다.`)
  }
  // expiresIn 은 초 단위입니다 (접근 토큰은 300초).
  const seconds = typeof expiresIn === 'number' && Number.isFinite(expiresIn) ? expiresIn : 300
  return { accessToken, idToken, secToken, expiresAt: Date.now() + seconds * 1000 }
}

/** 로그인 실패를 사용자에게 보여 줄 문구로 바꿉니다. */
function loginMessage(status: number, message: string): string {
  switch (status) {
    case 401:
      // 어느 쪽이 틀렸는지 알려 주지 않습니다 (계정이 있는지 떠볼 수 없게 하려는 설계입니다).
      return '이메일 또는 비밀번호가 올바르지 않습니다.'
    case 403:
      return '사용이 중지된 계정입니다. 관리자에게 문의해 주세요.'
    case 409:
      return '추가 인증이 필요한 계정입니다. 관리자에게 문의해 주세요.'
    case 429:
      return '로그인 시도가 너무 잦습니다. 잠시 뒤에 다시 시도해 주세요.'
    case 400:
      return '로그인 요청이 올바르지 않습니다.'
    default:
      return message || '로그인하지 못했습니다. 잠시 뒤에 다시 시도해 주세요.'
  }
}

/**
 * 로그인.
 *
 * `credentials: 'include'` 가 없으면 갱신 쿠키가 저장되지 않아, 로그인은 되는데 갱신만 계속
 * 400 으로 실패하는 상태가 됩니다.
 */
export async function login(email: string, password: string): Promise<AuthSession> {
  const response = await fetch(`${AUTH_BASE}/login${CLIENT_QUERY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'include',
  })
  const { message, data } = await readBody(response)
  if (response.status !== 200) {
    throw new AuthError(response.status, loginMessage(response.status, message))
  }
  return toSession(data, '로그인')
}

/**
 * 토큰 갱신. 갱신 쿠키(자동)와 secToken(직접 넣는 헤더)이 모두 있어야 합니다.
 *
 * 403 은 세션이 폐기되었다는 뜻이므로 다시 시도하지 않습니다.
 */
export async function refresh(secToken: string): Promise<AuthSession> {
  const response = await fetch(`${AUTH_BASE}/token${CLIENT_QUERY}`, {
    method: 'POST',
    headers: { 'X-Sec-Token': secToken },
    credentials: 'include',
  })
  if (response.status === 403) {
    throw new AuthError(403, '로그인이 만료되었습니다. 다시 로그인해 주세요.', true)
  }
  const { message, data } = await readBody(response)
  if (response.status !== 200) {
    throw new AuthError(response.status, message || '로그인을 갱신하지 못했습니다.')
  }
  return toSession(data, '갱신')
}

/**
 * 로그아웃. 서버 쪽 갱신 토큰을 폐기합니다.
 *
 * 이미 발급된 접근 토큰은 남은 수명(최대 5분) 동안 유효합니다. 상태를 두지 않는 JWT 의 성질이라
 * 로그아웃으로 즉시 끊을 수는 없습니다.
 */
export async function logout(secToken: string): Promise<void> {
  await fetch(`${AUTH_BASE}/token${CLIENT_QUERY}`, {
    method: 'DELETE',
    headers: { 'X-Sec-Token': secToken },
    credentials: 'include',
  })
}

/** 로그인한 계정의 정보와 권한 목록. */
export async function fetchUserInfo(accessToken: string): Promise<AuthUserInfo> {
  const response = await fetch(`${AUTH_BASE}/userInfo${CLIENT_QUERY}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const { message, data } = await readBody(response)
  if (response.status !== 200) {
    throw new AuthError(response.status, message || '계정 정보를 불러오지 못했습니다.')
  }
  const info = (data ?? {}) as Partial<AuthUserInfo>
  return {
    lkAccountSub: info.lkAccountSub ?? '',
    lkAccountEmail: info.lkAccountEmail ?? '',
    lkAccountName: info.lkAccountName ?? '',
    lkAccountRole: info.lkAccountRole ?? '',
    authorities: Array.isArray(info.authorities) ? info.authorities : [],
  }
}
