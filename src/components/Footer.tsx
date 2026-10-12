import { HOMESCREEN_CONFIG, homescreenDefault, parseHomescreen } from '../data/homescreen'
import { useConfig } from '../hooks/useConfig'
import styles from './Footer.module.css'

/** 원본 페이지별로 배경색이 달랐기 때문에 톤을 골라 쓸 수 있게 했습니다. */
export type FooterTone = 'default' | 'muted' | 'container' | 'low'

const TONE_CLASS: Record<FooterTone, string> = {
  default: styles.toneDefault,
  muted: styles.toneMuted,
  container: styles.toneContainer,
  low: styles.toneLow,
}

function Footer({ tone = 'default' }: { tone?: FooterTone }) {
  /*
   * 이메일은 홈 화면 설정에서 옵니다.
   *
   * 관리 화면에서 이메일을 고치면 여기도 함께 바뀌어야 하므로 적어 두지 않고 설정을 읽습니다.
   * 설정은 한 번만 받아 두고 모든 화면이 함께 쓰므로(useConfig 의 캐시) 요청이 늘지 않고,
   * 받아 오지 못하면 기본값을 써서 문의 주소가 빈 채로 남지 않습니다.
   */
  const homescreen = useConfig(HOMESCREEN_CONFIG, parseHomescreen)
  const email = (homescreen.data ?? homescreenDefault()).contactEmailAddr

  return (
    <footer className={TONE_CLASS[tone]}>
      <div className={styles.inner}>
        <div>
          <div className={styles.brand}>쉽고 바른 우리말 언론인상</div>
          <p className={styles.note}>© 2026 쉽고 바른 우리말 언론인상. All Rights Reserved.</p>
          <p className={styles.note}>E. {email}</p>
        </div>
        <div className={styles.links}>
          <a className={styles.link} href={`mailto:${email}`}>
            문의하기
          </a>
        </div>
      </div>
    </footer>
  )
}

export default Footer
