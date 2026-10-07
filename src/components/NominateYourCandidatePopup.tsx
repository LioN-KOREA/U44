import Icon from './Icon'
import { Link } from 'react-router'
import { paths } from '../navigation'
import styles from './PopupCommons.module.css'

const POINTS = [
  { strong: '본인 추천 가능', rest: ' — 국민 누구나 추천할 수 있습니다.' },
  { strong: '기자·피디(PD)·아나운서', rest: '가 추천 대상입니다.' },
  { strong: '우리말 개선 용어', rest: '를 사용한 기사·방송을 찾습니다.' },
]

export interface PopupCardProps {
  /** 이 팝업만 닫습니다. */
  onClose: () => void
  /** 이 팝업을 닫고 오늘 하루 다시 열지 않습니다. */
  onHideToday: () => void
}

/**
 * 언론인 추천을 안내하는 팝업 카드.
 * 어두운 배경과 배치는 PopupLayer 가 맡고, 여기서는 카드 내용만 그립니다.
 */
function NominateYourCandidatePopup({ onClose, onHideToday }: PopupCardProps) {
  return (
    <section className={styles.card} aria-label="언론인 추천 안내">
      <button type="button" className={styles.close} aria-label="언론인 추천 안내 닫기" onClick={onClose}>
        <Icon name="close" />
      </button>

      <div className={styles.head}>
        <p className={styles.eyebrow}>2026 쉽고 바른 우리말 이달의 언론인상</p>
        <h3 className={styles.title}>
          쉽고 바른 우리말을 사용한
          <br />
          언론인을 추천해 주세요
        </h3>
      </div>

      <div className={styles.body}>
        <div className={styles.banner}>
          <div className={styles.bannerRow}>
            <Icon name="campaign" />
            <p>11월 시상식 언론인 추천 접수 중</p>
          </div>
        </div>

        <ul className={styles.points}>
          {POINTS.map((point) => (
            <li key={point.strong} className={styles.point}>
              <Icon name="check_circle" className={styles.pointIcon} />
              <p>
                <span className={styles.pointStrong}>{point.strong}</span>
                {point.rest}
              </p>
            </li>
          ))}
        </ul>

        <Link to={paths.nomination} className={styles.action} onClick={onClose}>
          언론인 추천하기
        </Link>
        <button type="button" className={styles.hideToday} onClick={onHideToday}>
          오늘 하루 보지 않기
        </button>
      </div>
    </section>
  )
}

export default NominateYourCandidatePopup
