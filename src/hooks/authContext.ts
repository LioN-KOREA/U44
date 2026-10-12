import { createContext, useContext } from 'react'
import type { AuthUserInfo } from '../data/auth'

/**
 * 로그인 상태를 읽는 통로.
 *
 * 값을 채우는 쪽은 AuthProvider 입니다. 훅만 따로 둔 이유는, 컴포넌트와 훅이 한 파일에 섞여 있으면
 * 개발 중 빠른 새로고침(fast refresh)이 동작하지 않기 때문입니다.
 */
export interface AuthState {
  signedIn: boolean
  user: AuthUserInfo | null
  /** 관리 화면을 열 수 있는 권한이 있는지. 화면을 감추는 용도이고, 진짜 차단은 서버가 합니다. */
  canManage: boolean
  busy: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  /**
   * 관리 API 를 부를 때 쓸 접근 토큰. 만료가 가까우면 먼저 갱신합니다.
   * 로그인 상태가 아니면 null 입니다.
   */
  getAccessToken: () => Promise<string | null>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth 는 AuthProvider 안에서만 쓸 수 있습니다.')
  return value
}
