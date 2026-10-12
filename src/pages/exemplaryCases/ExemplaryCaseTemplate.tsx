import Icon from '../../components/Icon'
import type { ExemplaryCase, ExemplaryPair } from '../../data/exemplaryCases'
import styles from './ExemplaryCases.module.css'

/**
 * 우수사례 한 회차를 그립니다.
 *
 * 2026년 7월·8월을 손으로 쓰면서 같은 짜임새가 두 번 나온 것을 확인하고, 그 짜임새를 그대로
 * 틀로 옮긴 것입니다. 여덟 칸의 순서와 모양은 여기에 고정되어 있고, 글과 낱말 짝만 설정에서
 * 옵니다. 그래서 새 회차를 올리는 데 배포가 필요 없습니다.
 */

/** 왼쪽(쓰던 말) → 오른쪽(바꾼 말) 비교 카드. */
function SwapCard({ pair, tinted = false }: { pair: ExemplaryPair; tinted?: boolean }) {
  return (
    <div className={`${styles.card} ${tinted ? styles.swapTinted : ''}`}>
      <div className={styles.swapRow}>
        <span className={styles.swapFrom}>{pair.from}</span>
        <Icon name="arrow_forward" className={styles.swapArrow} />
        <span className={styles.swapTo}>{pair.to}</span>
      </div>
    </div>
  )
}

/** 위아래로 쌓은 라벨 → 값 카드. */
function StackCard({ pair, centered = false }: { pair: ExemplaryPair; centered?: boolean }) {
  return (
    <div className={centered ? styles.stackCenter : styles.stackCard}>
      <div className={styles.stackFrom}>{pair.from}</div>
      <div className={styles.stackTo}>{pair.to}</div>
    </div>
  )
}

/** 짝이 하나도 없는 칸은 제목만 남아 어색하므로 통째로 건너뜁니다. */
function Section({
  id,
  title,
  lead,
  children,
}: {
  id: string
  title: string
  lead?: string
  children: React.ReactNode
}) {
  return (
    <section className={styles.section} id={id}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {lead && <p className={styles.sectionLead}>{lead}</p>}
      {children}
    </section>
  )
}

function ExemplaryCaseTemplate({ data }: { data: ExemplaryCase }) {
  /*
   * 목차는 내용이 있는 칸만 싣습니다.
   *
   * 어떤 달에는 비어 있는 칸이 생기는데(8월에는 맞춤법 짝이 없었습니다), 목차에 남겨 두면
   * 눌러도 아무것도 없는 곳으로 내려갑니다.
   */
  const sections = [
    { id: 'sec-1', title: data.foreignToKorean.title, show: data.foreignToKorean.pairs.length > 0 },
    { id: 'sec-2', title: data.plainerWording.title, show: data.plainerWording.pairs.length > 0 },
    { id: 'sec-3', title: data.abbreviations.title, show: data.abbreviations.pairs.length > 0 },
    { id: 'sec-4', title: data.glosses.title, show: data.glosses.pairs.length > 0 },
    {
      id: 'sec-5',
      title: data.carefulWording.title,
      show: data.carefulWording.pairs.length > 0 || data.carefulWording.noteBody !== '',
    },
    {
      id: 'sec-6',
      title: data.broadcastTerms.title,
      show: data.broadcastTerms.pairs.length > 0 || data.broadcastTerms.spellingPairs.length > 0,
    },
    { id: 'sec-7', title: data.settlingIn.title, show: data.settlingIn.pairs.length > 0 },
    { id: 'sec-8', title: data.recommended.title, show: data.recommended.groups.length > 0 },
  ].filter((section) => section.show && section.title)

  return (
    <article className={styles.article}>
      <header className={styles.banner}>
        <span className={styles.monthBadge}>
          {data.year}년 {data.month}월
        </span>
        <h2 className={styles.bannerTitle}>쉽고 바른 우리말 우수사례</h2>
        {data.lead && (
          <div className={styles.leadBox}>
            <p className={styles.lead}>{data.lead}</p>
          </div>
        )}
      </header>

      <div className={styles.layout}>
        <nav className={styles.toc} aria-label="목차 바로가기">
          <div className={styles.tocHead}>
            <Icon name="list_alt" />
            목차 바로가기
          </div>
          <ul className={styles.tocList}>
            {sections.map((section) => (
              <li key={section.id}>
                {/*
                  주소창에 #구역 이 쌓이지 않도록 해시를 바꾸지 않고 직접 스크롤합니다.
                  (href 는 링크 의미를 남겨 두기 위해 유지)
                */}
                <a
                  className={styles.tocLink}
                  href={`#${section.id}`}
                  onClick={(event) => {
                    event.preventDefault()
                    document
                      .getElementById(section.id)
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.sections}>
          {/* 1 — 익숙한 외국어·외래어 대신 우리말로 */}
          {data.foreignToKorean.pairs.length > 0 && (
            <Section id="sec-1" title={data.foreignToKorean.title} lead={data.foreignToKorean.lead}>
              <div className={styles.grid2}>
                {data.foreignToKorean.pairs.map((pair) => (
                  <SwapCard key={pair.from} pair={pair} tinted />
                ))}
              </div>
            </Section>
          )}

          {/* 2 — 어려운 표현을 쉽고 자연스럽게 */}
          {data.plainerWording.pairs.length > 0 && (
            <Section id="sec-2" title={data.plainerWording.title} lead={data.plainerWording.lead}>
              <div className={styles.grid3}>
                {data.plainerWording.pairs.map((pair) => (
                  <StackCard key={pair.from} pair={pair} />
                ))}
              </div>
            </Section>
          )}

          {/* 3 — 약어와 전문용어는 알기 쉽게 */}
          {data.abbreviations.pairs.length > 0 && (
            <Section id="sec-3" title={data.abbreviations.title} lead={data.abbreviations.lead}>
              <div className={styles.grid2}>
                {data.abbreviations.pairs.map((pair) => (
                  <StackCard key={pair.from} pair={pair} />
                ))}
              </div>
            </Section>
          )}

          {/* 4 — 한 단어 대신 뜻을 풀어 쓴 표현 */}
          {data.glosses.pairs.length > 0 && (
            <Section id="sec-4" title={data.glosses.title} lead={data.glosses.lead}>
              <div className={styles.glossList}>
                {data.glosses.pairs.map((pair) => (
                  <div key={pair.from} className={styles.glossRow}>
                    <h4 className={styles.glossTerm}>{pair.from}</h4>
                    <span className={styles.glossMeaning}>{pair.to}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* 5 — 보다 정확하고 신중한 표현 */}
          {(data.carefulWording.pairs.length > 0 || data.carefulWording.noteBody) && (
            <Section id="sec-5" title={data.carefulWording.title} lead={data.carefulWording.lead}>
              {data.carefulWording.pairs.length > 0 && (
                <div className={styles.grid2}>
                  {data.carefulWording.pairs.map((pair) => (
                    <div key={pair.from} className={styles.adviceCard}>
                      <span className={styles.adviceAvoid}>{pair.from}</span>
                      <span className={styles.adviceUse}>{pair.to}</span>
                    </div>
                  ))}
                </div>
              )}
              {data.carefulWording.noteBody && (
                <div className={styles.noteCard}>
                  {data.carefulWording.noteTitle && (
                    <h4 className={styles.noteTitle}>{data.carefulWording.noteTitle}</h4>
                  )}
                  <p className={styles.noteBody}>{data.carefulWording.noteBody}</p>
                </div>
              )}
            </Section>
          )}

          {/* 6 — 방송 속 우리말 & 바른 표현 */}
          {(data.broadcastTerms.pairs.length > 0 || data.broadcastTerms.spellingPairs.length > 0) && (
            <Section id="sec-6" title={data.broadcastTerms.title} lead={data.broadcastTerms.lead}>
              <div className={styles.grid2}>
                {data.broadcastTerms.pairs.map((pair) => (
                  <SwapCard key={pair.from} pair={pair} />
                ))}
              </div>
              {/* 맞춤법이 헷갈리기 쉬운 표현은 원본처럼 따로 묶었습니다. */}
              {data.broadcastTerms.spellingPairs.length > 0 && (
                <div className={`${styles.grid2} ${styles.gridGap}`}>
                  {data.broadcastTerms.spellingPairs.map((pair) => (
                    <SwapCard key={pair.from} pair={pair} />
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* 7 — 우리말로 자리 잡아 가는 표현 */}
          {data.settlingIn.pairs.length > 0 && (
            <Section id="sec-7" title={data.settlingIn.title} lead={data.settlingIn.lead}>
              <div className={styles.grid4}>
                {data.settlingIn.pairs.map((pair) => (
                  <StackCard key={pair.from} pair={pair} centered />
                ))}
              </div>
            </Section>
          )}

          {/* 8 — 앞으로 눈여겨볼 우리말 표현 */}
          {data.recommended.groups.length > 0 && (
            <Section id="sec-8" title={data.recommended.title}>
              <div className={styles.calloutBanner}>
                <div className={styles.calloutHead}>
                  <Icon name="campaign" className={styles.calloutIcon} />
                  <h4 className={styles.calloutTitle}>{data.recommended.calloutTitle}</h4>
                </div>
                {data.recommended.lead && <p className={styles.calloutLead}>{data.recommended.lead}</p>}
                <div className={styles.calloutColumns}>
                  {data.recommended.groups.map((group, index) => (
                    <div key={index} className={styles.calloutGroup}>
                      {group.map((pair) => (
                        <div key={pair.from} className={styles.calloutRow}>
                          <span className={styles.calloutFrom}>{pair.from}</span>
                          <span className={styles.calloutTo}>{pair.to}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </Section>
          )}

          {data.sourceNote && <p className={styles.staticSourceNote}>{data.sourceNote}</p>}
        </div>
      </div>
    </article>
  )
}

export default ExemplaryCaseTemplate
