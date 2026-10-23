import { createContext, useContext } from 'react'
import type { AuthUser } from '../data/auth'

/**
 * 로그인 상태를 읽는 통로.
 *
 * 값을 채우는 쪽은 AuthProvider 입니다. 훅만 따로 둔 이유는, 컴포넌트와 훅이 한 파일에 섞여 있으면
 * 개발 중 빠른 새로고침(fast refresh)이 동작하지 않기 때문입니다.
 */
export interface AuthState {
  /**
   * idle      : 아직 확인하지 않음 (관리 화면에 들어오기 전에는 확인하지 않습니다)
   * checking  : 세션을 확인하거나 로그인을 마무리하는 중
   * signedIn  : 로그인됨
   * signedOut : 로그인되어 있지 않음
   */
  status: 'idle' | 'checking' | 'signedIn' | 'signedOut'
  user: AuthUser | null
  /** 관리 화면을 열 수 있는 권한이 있는지. 화면을 감추는 용도이고, 진짜 차단은 서버가 합니다. */
  canManage: boolean
  /** 마지막 로그인 시도가 실패한 이유. 있으면 자동으로 다시 로그인하러 가지 않습니다. */
  error: string | null
  /**
   * 관리 화면에 들어왔을 때 한 번 부릅니다. 계정 시스템에서 돌아온 주소면 로그인을 마무리하고,
   * 아니면 세션 쿠키로 로그인 상태를 되찾습니다. 같은 주소로 여러 번 불러도 한 번만 처리합니다.
   */
  resume: (search: string) => Promise<void>
  /** 계정 시스템 로그인으로 이동합니다. */
  signIn: () => void
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
