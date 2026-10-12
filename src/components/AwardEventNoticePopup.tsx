import { Link } from 'react-router'
import Icon from './Icon'
import { paths } from '../navigation'
import styles from './PopupCommons.module.css'
import type { PopupCardProps } from './NominateYourCandidatePopup'

export interface AwardNoticePopupProps extends PopupCardProps {
  /** 시상 시각 (밀리초). 관리 화면에서 정합니다. */
  ceremonyTime: number
  /** 장소. 비어 있으면 그 줄을 그리지 않습니다. */
  location: string
}

const SEOUL = 'Asia/Seoul'

/** '10. 20.(화) 오전 11시' */
function formatCeremony(time: number): string {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: SEOUL, month: 'numeric', day: 'numeric', weekday: 'short',
    hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  }).formatToParts(time)
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  const hour = Number(pick('hour'))
  const minute = Number(pick('minute'))
  const period = hour < 12 ? '오전' : '오후'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  const clock = `${period} ${h12}시${minute ? ` ${minute}분` : ''}`
  return `${pick('month')}. ${pick('day')}.(${pick('weekday')}) ${clock}`
}

/**
 * 9월 시상식 일정을 알리는 팝업 카드.
 * 어두운 배경과 배치는 PopupLayer 가 맡고, 여기서는 카드 내용만 그립니다.
 */
function AwardEventNoticePopup({ ceremonyTime, location, onClose, onHideToday }: AwardNoticePopupProps) {
  const month = Number(
    new Intl.DateTimeFormat('ko-KR', { timeZone: SEOUL, month: 'numeric' })
      .formatToParts(ceremonyTime)
      .find((p) => p.type === 'month')?.value,
  )
  return (
    <section className={styles.card} aria-label={`${month}월 시상식 안내`}>
      <button type="button" className={styles.close} aria-label={`${month}월 시상식 안내 닫기`} onClick={onClose}>
        <Icon name="close" />
      </button>

      <div className={styles.head}>
        <p className={styles.eyebrow}>2026 {month}월 시상식</p>
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
            <p>{formatCeremony(ceremonyTime)}</p>
          </div>
          {location && <p>{location}</p>}
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
