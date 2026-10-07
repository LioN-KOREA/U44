import { Link } from 'react-router'
import Icon from './Icon'
import { paths } from '../navigation'
import styles from './PopupCommons.module.css'
import type { PopupCardProps } from './NominateYourCandidatePopup'

/**
 * 9월 시상식 일정을 알리는 팝업 카드.
 * 어두운 배경과 배치는 PopupLayer 가 맡고, 여기서는 카드 내용만 그립니다.
 */
function AwardEventNoticePopup({ onClose, onHideToday }: PopupCardProps) {
  return (
    <section className={styles.card} aria-label="10월 시상식 안내">
      <button type="button" className={styles.close} aria-label="10월 시상식 안내 닫기" onClick={onClose}>
        <Icon name="close" />
      </button>

      <div className={styles.head}>
        <p className={styles.eyebrow}>2026 10월 시상식</p>
        <h3 className={styles.title}>
          쉽고 바른 우리말
          <br />
          이달의 언론인상
        </h3>
      </div>

      <div className={styles.body}>
        <div className={styles.banner}>
          <div className={styles.bannerRow}>
            <Icon name="event_available" />
            <p>10. 20.(화) 오전 11시</p>
          </div>
          <p>한국방송회관 회견장</p>
        </div>

        <div className={styles.textNonPoint}>
          <p>우리말 사용의 모범이 되는 우수 보도를</p>
          <p>선정해 시상하는 자리에 함께해 주세요.</p>
        </div>

        <Link to={paths.introduction} className={styles.viewNotice} onClick={onClose}>
          시상식 안내 보기
        </Link>
        <button type="button" className={styles.hideToday} onClick={onHideToday}>
          오늘 하루 보지 않기
        </button>
      </div>
    </section>
  )
}

export default AwardEventNoticePopup
