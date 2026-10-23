import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AuthError,
  beginLogin,
  completeLogin,
  isLoginCallback,
  logout as logoutRequest,
  refreshSession,
  type AuthSession,
  type AuthUser,
} from '../data/auth'
import { setAccessTokenProvider } from '../data/manage'
import { AuthContext, type AuthState } from './authContext'

/**
 * 로그인 상태를 들고 있는 곳.
 *
 * 접근 토큰은 이 안의 ref 에만 둡니다 — 저장소에 쓰지 않습니다 (연동 안내서: "Keep the access token
 * in memory"). 리프레시 토큰은 아예 브라우저에 오지 않고 백엔드에 있으므로, 새로 고쳐도 세션
 * 쿠키로 /api/auth/refresh 를 불러 로그인 상태를 되찾습니다.
 *
 * 사이트 전체를 감싸지만, 관리 화면에 들어오기 전에는 아무 요청도 하지 않습니다 (resume 을 부르는
 * 것은 ManageRoute 뿐입니다). 첫 화면을 보러 온 방문자마다 세션을 확인할 이유가 없습니다.
 */

/**
 * 만료 몇 밀리초 전에 미리 갱신할지.
 *
 * 백엔드는 남은 수명이 60초보다 짧은 토큰만 새로 바꿔 주고 그보다 길면 지금 토큰을 그대로 돌려주므로,
 * 그보다 짧게 잡아야 갱신 요청이 실제 갱신이 됩니다.
 */
const REFRESH_MARGIN_MS = 45_000
/** 갱신이 서버·네트워크 문제로 실패했을 때 다시 시도하기까지. */
const RETRY_DELAY_MS = 10_000

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useRef<AuthSession | null>(null)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 진행 중인 갱신. 한 탭 안에서 갱신이 겹치지 않게 합니다 (탭 사이는 백엔드가 막습니다). */
  const inFlight = useRef<Promise<AuthSession | null> | null>(null)
  /** 처리한(또는 처리 중인) 주소. 개발 모드에서 effect 가 두 번 돌아도 코드를 두 번 쓰지 않게 합니다. */
  const resumed = useRef<{ search: string; done: Promise<void> } | null>(null)

  const [status, setStatus] = useState<AuthState['status']>('idle')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [error, setError] = useState<string | null>(null)

  const clearTimer = () => {
    if (refreshTimer.current !== null) {
      clearTimeout(refreshTimer.current)
      refreshTimer.current = null
    }
  }

  useEffect(() => clearTimer, [])

  /** 로그인 흔적을 이 탭에서 지웁니다. 서버 호출은 하지 않습니다. */
  const forget = useCallback((reason: string | null) => {
    clearTimer()
    session.current = null
    setUser(null)
    setError(reason)
    setStatus('signedOut')
  }, [])

  /*
   * 새 접근 토큰을 받아 두고, 다음 갱신을 예약합니다.
   *
   * 다음 갱신을 스스로 예약해야 하므로, 갱신 함수와 서로를 부릅니다 (ref 로 이어 둡니다).
   */
  const refreshRef = useRef<() => Promise<AuthSession | null>>(async () => null)

  const adopt = useCallback((next: AuthSession) => {
    session.current = next
    setUser(next.user)
    setError(null)
    setStatus('signedIn')
    clearTimer()
    const delay = Math.max(next.expiresAt - Date.now() - REFRESH_MARGIN_MS, 1_000)
    refreshTimer.current = setTimeout(() => void refreshRef.current(), delay)
  }, [])

  /**
   * 백엔드에 다음 접근 토큰을 받습니다. 동시에 여러 곳에서 불러도 요청은 하나만 나갑니다.
   *
   * 세션이 끝났으면(401) 로그아웃 상태로 바꿉니다 — 다시 시도하지 않습니다. 서버·네트워크 문제면
   * 지금 토큰이 살아 있는 동안 잠시 뒤에 다시 시도합니다.
   */
  const refresh = useCallback(async (): Promise<AuthSession | null> => {
    if (inFlight.current) return inFlight.current
    const attempt = (async () => {
      try {
        const next = await refreshSession()
        if (next) adopt(next)
        else forget(session.current ? '로그인이 만료되었습니다. 다시 로그인해 주세요.' : null)
        return next
      } catch (err) {
        console.error(err)
        const current = session.current
        if (current && current.expiresAt - Date.now() > RETRY_DELAY_MS) {
          clearTimer()
          refreshTimer.current = setTimeout(() => void refreshRef.current(), RETRY_DELAY_MS)
          return current
        }
        forget(err instanceof AuthError ? err.message : '로그인 상태를 확인하지 못했습니다.')
        return null
      } finally {
        inFlight.current = null
      }
    })()
    inFlight.current = attempt
    return attempt
  }, [adopt, forget])

  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  const resume = useCallback(
    (search: string) => {
      const callback = isLoginCallback(search)
      // 로그인 마무리는 주소마다 한 번뿐입니다 (코드는 한 번만 쓸 수 있습니다).
      const key = callback ? search : ''
      if (resumed.current?.search === key) return resumed.current.done

      setStatus('checking')
      const done = (async () => {
        if (!callback) {
          await refresh()
          return
        }
        try {
          adopt(await completeLogin(search))
        } catch (err) {
          console.error(err)
          forget(err instanceof AuthError ? err.message : '로그인하지 못했습니다. 다시 시도해 주세요.')
        }
      })()
      resumed.current = { search: key, done }
      return done
    },
    [adopt, forget, refresh],
  )

  const signIn = useCallback(() => {
    setError(null)
    setStatus('checking')
    beginLogin()
  }, [])

  const signOut = useCallback(async () => {
    try {
      // 성공하면 계정 시스템의 /logout 으로 이동합니다. 이 탭의 상태는 그때 함께 사라집니다.
      await logoutRequest()
      clearTimer()
      session.current = null
    } catch (err) {
      console.error(err)
      setError(err instanceof AuthError ? err.message : '로그아웃하지 못했습니다. 다시 시도해 주세요.')
    }
  }, [])

  /*
   * 관리 API 를 부르기 직전에 쓰는 토큰.
   *
   * 예약 갱신과 별개로, 남은 수명이 얼마 없으면 여기서 한 번 더 갱신합니다. 탭이 백그라운드에
   * 있어 타이머가 늦게 깨어난 경우를 위한 것입니다.
   */
  const getAccessToken = useCallback(async () => {
    const current = session.current
    if (!current) return null
    if (current.expiresAt - Date.now() > 10_000) return current.accessToken
    return (await refresh())?.accessToken ?? null
  }, [refresh])

  /*
   * 관리 API 모듈에 토큰 꺼내는 방법을 알려 줍니다.
   *
   * 토큰 자체를 넘기지 않고 함수를 넘기는 이유는, 호출 직전에 만료를 확인하고 필요하면 갱신한
   * 최신 토큰을 돌려주기 위해서입니다.
   */
  useEffect(() => {
    setAccessTokenProvider(getAccessToken)
    return () => setAccessTokenProvider(null)
  }, [getAccessToken])

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      canManage: user?.canManage ?? false,
      error,
      resume,
      signIn,
      signOut,
      getAccessToken,
    }),
    [status, user, error, resume, signIn, signOut, getAccessToken],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
