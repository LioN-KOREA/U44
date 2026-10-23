import Icon from '../components/Icon'
import { useAuth } from '../hooks/authContext'
import styles from './LoginPage.module.css'

/**
 * 관리자 로그인.
 *
 * 메뉴 어디에도 걸어 두지 않았고, /manage 로 들어왔을 때만 나옵니다. 숨겨 두는 것 자체가
 * 보안은 아니므로(주소는 알려질 수 있습니다) 실제 차단은 토큰 검사와 권한 확인이 합니다.
 *
 * 이메일·비밀번호는 이 사이트가 받지 않습니다. 로그인 화면은 계정관리 시스템 쪽에 있고, 이
 * 사이트는 그리로 보냈다가 돌아온 결과만 받습니다. 다른 서비스에 이미 로그인해 있으면 그 화면조차
 * 거치지 않고 곧바로 돌아옵니다 (SSO).
 *
 * 평소에는 ManageRoute 가 곧바로 로그인으로 보내므로 이 화면이 잠깐 보였다가 넘어갑니다. 로그인이
 * 실패했거나 세션이 끝났을 때만 이유와 함께 머물러, 사용자가 다시 시도할지 고르게 합니다.
 */
function LoginPage() {
  const { status, error, signIn } = useAuth()
  const working = status === 'checking' || (status !== 'signedOut' && !error)

  return (
    <main className={styles.main}>
      <section className={styles.card} aria-label="관리자 로그인">
        <div className={styles.head}>
          <Icon name="lock" className={styles.headIcon} />
          <h1 className={styles.title}>관리자 로그인</h1>
          <p className={styles.subtitle}>시상식 정보를 고치려면 먼저 로그인해 주세요.</p>
        </div>

        <div className={styles.form}>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <button type="button" className={styles.submit} onClick={signIn} disabled={working}>
            {working ? '로그인 화면으로 이동하는 중…' : '라이온코리아 계정으로 로그인'}
          </button>
        </div>

        <p className={styles.note}>
          계정은 라이온코리아 IT 서비스 계정관리 시스템에서 관리합니다. 접근 권한이 필요하면
          관리자에게 문의해 주세요.
        </p>
      </section>
    </main>
  )
}

export default LoginPage
