import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'
import Icon from '../components/Icon'
import { useAuth } from '../hooks/authContext'
import LoginPage from './LoginPage'
import ManagePage from './ManagePage'
import styles from './LoginPage.module.css'

/**
 * /manage 에서 무엇을 보여 줄지 고릅니다.
 *
 *   확인 전·확인 중      -> 로그인 화면 (단추는 잠겨 있음)
 *   로그인 안 됨         -> 곧바로 계정 시스템 로그인으로 이동
 *   로그인 실패·만료     -> 이유와 함께 로그인 화면 (자동으로 다시 보내지 않음)
 *   권한 없음            -> 안내 문구와 로그아웃
 *   권한 있음            -> 관리 화면
 *
 * /manage 는 계정 시스템에 등록된 redirect URI 이기도 합니다. 로그인을 마치면 브라우저가
 * /manage?code=…&state=… 로 돌아오고, 여기서 그 쿼리를 백엔드에 넘겨 로그인을 마무리합니다.
 *
 * 여기서 거르는 것은 화면일 뿐입니다. 실제 차단은 백엔드가 모든 /api/management 요청마다
 * 토큰을 검사하고 권한을 확인해서 합니다 (연동 안내서: "UI 숨김은 접근 제어가 아닙니다").
 */
function ManageRoute() {
  const { status, error, canManage, user, resume, signIn, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  // 들어오자마자 한 번: 로그인을 마무리하거나, 세션 쿠키로 로그인 상태를 되찾습니다.
  useEffect(() => {
    if (status !== 'idle') return
    const search = location.search
    void resume(search).then(() => {
      // code 와 state 는 한 번 쓰면 끝입니다. 주소창과 방문 기록에 남기지 않습니다.
      if (search) navigate(location.pathname, { replace: true })
    })
  }, [status, location.search, location.pathname, resume, navigate])

  /*
   * 로그인되어 있지 않으면 곧바로 로그인으로 보냅니다. 다른 서비스에 로그인해 있으면 계정 시스템이
   * 화면 없이 바로 돌려보내므로, 사용자에게는 관리 화면이 그냥 열리는 것처럼 보입니다.
   *
   * 실패한 뒤에는 보내지 않습니다. 같은 이유로 또 실패하며 계정 시스템과 이 화면을 끝없이 오가게
   * 되기 때문입니다.
   */
  useEffect(() => {
    if (status === 'signedOut' && !error) signIn()
  }, [status, error, signIn])

  if (status !== 'signedIn') return <LoginPage />

  if (!canManage) {
    return (
      <main className={styles.main}>
        <section className={styles.card} aria-label="접근 권한 없음">
          <div className={styles.head}>
            <Icon name="lock" className={styles.headIcon} />
            <h1 className={styles.title}>접근 권한이 없습니다</h1>
            <p className={styles.subtitle}>{user?.email}</p>
          </div>
          <p className={styles.denied}>
            이 계정에는 관리 화면을 쓸 권한이 없습니다. 권한이 필요하면 관리자에게 문의해 주세요.
          </p>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.deniedActions}>
            {/* 계정 시스템에서도 로그아웃해야 다른 계정으로 로그인할 수 있습니다 (SSO). */}
            <button type="button" className={styles.linkButton} onClick={() => void signOut()}>
              로그아웃하고 다른 계정으로 로그인
            </button>
          </div>
        </section>
      </main>
    )
  }

  return <ManagePage />
}

export default ManageRoute
