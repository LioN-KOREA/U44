import Icon from '../components/Icon'
import { useAuth } from '../hooks/authContext'
import LoginPage from './LoginPage'
import ManagePage from './ManagePage'
import styles from './LoginPage.module.css'

/**
 * /manage 에서 무엇을 보여 줄지 고릅니다.
 *
 *   로그인 전      -> 로그인 화면 (메뉴에 없는, 이 경로로만 닿는 화면)
 *   권한 없음      -> 안내 문구와 로그아웃
 *   권한 있음      -> 관리 화면
 *
 * 여기서 거르는 것은 화면일 뿐입니다. 실제 차단은 백엔드가 모든 /api/management 요청마다
 * 토큰을 검사하고 권한을 확인해서 합니다 (reference.md: "Enforce on the server").
 */
function ManageRoute() {
  const { signedIn, canManage, user, signOut } = useAuth()

  if (!signedIn) return <LoginPage />

  if (!canManage) {
    return (
      <main className={styles.main}>
        <section className={styles.card} aria-label="접근 권한 없음">
          <div className={styles.head}>
            <Icon name="lock" className={styles.headIcon} />
            <h1 className={styles.title}>접근 권한이 없습니다</h1>
            <p className={styles.subtitle}>{user?.lkAccountEmail}</p>
          </div>
          <p className={styles.denied}>
            이 계정에는 관리 화면을 쓸 권한이 없습니다. 권한이 필요하면 관리자에게 문의해 주세요.
          </p>
          <div className={styles.deniedActions}>
            <button type="button" className={styles.linkButton} onClick={() => void signOut()}>
              다른 계정으로 로그인
            </button>
          </div>
        </section>
      </main>
    )
  }

  return <ManagePage />
}

export default ManageRoute
