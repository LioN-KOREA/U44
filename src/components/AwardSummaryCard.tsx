import styles from './AwardSummaryCard.module.css'

const BREAKDOWN = [
  { count: 5, role: '기자', note: '— 신문·방송' },
  { count: 2, role: '피디(PD)', note: null },
  { count: 1, role: '아나운서', note: null },
]

/** '이달의 언론인상 총 8명 선정 / 상금' 요약. 홈과 시상식 안내에 함께 쓰입니다. */
function AwardSummaryCard() {
  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.head}>
          <span className={styles.eyebrow}>쉽고 바른 우리말 이달의 언론인상</span>
          <p className={styles.total}>총 {BREAKDOWN.reduce((pv, cv) => pv + cv.count, 0)}명 선정</p>
        </div>
        <ul className={styles.breakdown}>
          {BREAKDOWN.map((item) => (
            <li key={item.role}>
              <p className={styles.count}>
                {item.count}
                <span className={styles.countUnit}>명</span>
              </p>
              <p className={styles.role}>
                {item.role}
                {item.note && <span className={styles.roleNote}>{item.note}</span>}
              </p>
            </li>
          ))}
        </ul>
        <div className={styles.prizeArea}>
          <p className={styles.prize}>
            수상자 1인당 상금 <span className={styles.prizeAmount}>50만 원</span>
          </p>
          <p className={styles.prizeNote}>12월 시상 내용은 추후 안내할 예정입니다.</p>
        </div>
      </div>
    </div>
  )
}

export default AwardSummaryCard
