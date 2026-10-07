import { Link } from 'react-router'
import Icon from './Icon'
import SafeImage from './SafeImage'
import { formatShortDate, sectionSummary, type AwardCeremony } from '../data/awards'
import { paths } from '../navigation'
import styles from './AwardCeremonyCard.module.css'

interface AwardCeremonyCardProps {
  ceremony: AwardCeremony
}

/**
 * 시상식 한 회차를 나타내는 목록 카드. 누르면 상세로 이동합니다.
 * 진짜 링크라서 새 탭으로 열거나 주소를 복사할 수도 있습니다.
 */
function AwardCeremonyCard({ ceremony }: AwardCeremonyCardProps) {
  const date = formatShortDate(ceremony.ceremonyTime)

  return (
    <Link
      to={paths.ceremony(ceremony.id)}
      className={styles.card}
      aria-label={`${ceremony.title} 상세 보기`}
    >
      <span className={styles.monthBadge}>
        {ceremony.month}월
      </span>

      <SafeImage
        className={styles.thumb}
        imageClassName={styles.thumbImage}
        src={ceremony.representativePicture}
        alt={`${ceremony.title} 단체 사진`}
      />

      <span className={styles.body}>
        <span>
          <span className={styles.title}>{ceremony.title}</span>
          <span className={styles.sections}>{sectionSummary(ceremony)}</span>
          <span className={styles.date}>{date ?? '일정 추후 안내'}</span>
        </span>
        <Icon name="chevron_right" className={styles.chevron} />
      </span>
    </Link>
  )
}

export default AwardCeremonyCard
