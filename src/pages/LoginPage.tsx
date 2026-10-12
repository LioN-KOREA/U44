import { useState, type FormEvent } from 'react'
import Icon from '../components/Icon'
import { useAuth } from '../hooks/authContext'
import styles from './LoginPage.module.css'

/**
 * 관리자 로그인.
 *
 * 메뉴 어디에도 걸어 두지 않았고, /manage 로 들어왔을 때만 나옵니다. 숨겨 두는 것 자체가
 * 보안은 아니므로(주소는 알려질 수 있습니다) 실제 차단은 토큰 검사와 권한 확인이 합니다.
 */
function LoginPage() {
  const { signIn, busy, error } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    try {
      await signIn(email.trim(), password)
    } catch {
      // 실패 이유는 useAuth 가 error 로 들고 있습니다. 비밀번호만 비워 다시 입력받습니다.
      setPassword('')
    }
  }

  return (
    <main className={styles.main}>
      <section className={styles.card} aria-label="관리자 로그인">
        <div className={styles.head}>
          <Icon name="lock" className={styles.headIcon} />
          <h1 className={styles.title}>관리자 로그인</h1>
          <p className={styles.subtitle}>시상식 정보를 고치려면 먼저 로그인해 주세요.</p>
        </div>

        <form className={styles.form} onSubmit={(e) => void onSubmit(e)}>
          <label className={styles.field}>
            <span className={styles.label}>이메일</span>
            <input
              type="email"
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
              disabled={busy}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>비밀번호</span>
            <input
              type="password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              disabled={busy}
            />
          </label>

          {/* 로그인 실패 문구. 어느 쪽이 틀렸는지는 알려 주지 않습니다. */}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <button type="submit" className={styles.submit} disabled={busy || !email || !password}>
            {busy ? '확인 중…' : '로그인'}
          </button>
        </form>

        <p className={styles.note}>
          계정은 라이온코리아 IT 서비스 계정관리 시스템에서 관리합니다. 접근 권한이 필요하면
          관리자에게 문의해 주세요.
        </p>
      </section>
    </main>
  )
}

export default LoginPage
