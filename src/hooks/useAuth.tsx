import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AuthError,
  MANAGE_AUTHORITY_ID,
  fetchUserInfo,
  login as loginRequest,
  logout as logoutRequest,
  refresh as refreshRequest,
  type AuthSession,
  type AuthUserInfo,
} from '../data/auth'
import { setAccessTokenProvider } from '../data/manage'
import { AuthContext, type AuthState } from './authContext'

/**
 * 로그인 상태를 들고 있는 곳.
 *
 * 토큰은 이 안의 ref 에만 둡니다 — 저장소에 쓰지 않으므로 새로 고치면 로그인도 풀립니다.
 * 그 대신 XSS 하나로 토큰이 통째로 새는 일이 없습니다 (reference.md 가 요구하는 방식입니다).
 *
 * 새로 고쳤을 때 로그인을 되살리지 않는 것은 선택이 아니라 구조상의 결과입니다: 갱신에는 쿠키와
 * secToken 이 둘 다 필요한데, secToken 은 메모리에만 있으므로 새로 고치면 사라집니다. 쿠키만으로는
 * 갱신할 수 없고, 그것이 CSRF 를 막는 장치이기도 합니다.
 *
 * 접근 토큰은 5분짜리라, 만료 1분 전에 스스로 갱신합니다. 갱신이 403 으로 거절되면 세션이
 * 폐기된 것이므로 다시 시도하지 않고 로그아웃합니다.
 */

/** 만료 몇 밀리초 전에 미리 갱신할지. */
const REFRESH_MARGIN_MS = 60_000

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useRef<AuthSession | null>(null)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [user, setUser] = useState<AuthUserInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clearTimer = () => {
    if (refreshTimer.current !== null) {
      clearTimeout(refreshTimer.current)
      refreshTimer.current = null
    }
  }

  /** 로그인 흔적을 모두 지웁니다. 서버 호출은 하지 않습니다. */
  const forget = useCallback(() => {
    clearTimer()
    session.current = null
    setUser(null)
  }, [])

  useEffect(() => clearTimer, [])

  /*
   * 갱신 예약.
   *
   * 화면을 띄워 둔 채로 시간이 지나도 관리 API 호출이 401 로 떨어지지 않도록, 만료 1분 전에
   * 미리 갱신해 둡니다. 갱신이 실패하면 세션을 버립니다 (403 이면 되돌릴 수 없는 상태입니다).
   *
   * 다음 갱신을 스스로 예약해야 하므로 이름 붙인 함수로 두고 그 이름을 부릅니다.
   */
  const scheduleRefresh = useCallback(
    function schedule(current: AuthSession) {
      clearTimer()
      const delay = Math.max(current.expiresAt - Date.now() - REFRESH_MARGIN_MS, 1_000)
      refreshTimer.current = setTimeout(() => {
        const secToken = session.current?.secToken
        if (!secToken) return
        refreshRequest(secToken)
          .then((next) => {
            session.current = next
            schedule(next)
          })
          .catch((err: unknown) => {
            console.error(err)
            forget()
          })
      }, delay)
    },
    [forget],
  )

  /** 세션을 받아 두고, 계정 정보를 읽고, 다음 갱신을 예약합니다. */
  const adopt = useCallback(
    async (next: AuthSession) => {
      session.current = next
      const info = await fetchUserInfo(next.accessToken)
      setUser(info)
      scheduleRefresh(next)
    },
    [scheduleRefresh],
  )

  const signIn = useCallback(
    async (email: string, password: string) => {
      setBusy(true)
      setError(null)
      try {
        await adopt(await loginRequest(email, password))
      } catch (err) {
        console.error(err)
        forget()
        setError(err instanceof Error ? err.message : '로그인하지 못했습니다.')
        throw err
      } finally {
        setBusy(false)
      }
    },
    [adopt, forget],
  )

  const signOut = useCallback(async () => {
    const secToken = session.current?.secToken
    forget()
    setError(null)
    if (!secToken) return
    try {
      await logoutRequest(secToken)
    } catch (err) {
      // 서버 쪽 폐기에 실패해도 이 브라우저에서는 이미 로그아웃된 상태입니다.
      console.error(err)
    }
  }, [forget])

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
    try {
      const next = await refreshRequest(current.secToken)
      session.current = next
      scheduleRefresh(next)
      return next.accessToken
    } catch (err) {
      console.error(err)
      if (err instanceof AuthError && err.sessionInvalid) forget()
      return null
    }
  }, [forget, scheduleRefresh])

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
      signedIn: user !== null,
      user,
      canManage: user?.authorities.includes(MANAGE_AUTHORITY_ID) ?? false,
      busy,
      error,
      signIn,
      signOut,
      getAccessToken,
    }),
    [user, busy, error, signIn, signOut, getAccessToken],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
