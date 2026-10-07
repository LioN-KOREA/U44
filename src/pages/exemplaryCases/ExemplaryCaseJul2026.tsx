import Icon from '../../components/Icon'
import styles from './ExemplaryCaseJul2026.module.css'

/**
 * 2026년 7월 쉽고 바른 우리말 우수사례.
 *
 * 회차마다 본문 구성이 달라 공용 틀을 쓰지 않고, 이 달의 내용만 여기서 직접 그립니다.
 * 내용은 전달받은 2026-07-stitch.html 을 그대로 옮긴 것이며,
 * 서체·색만 본 사이트의 디자인 토큰에 맞췄습니다.
 */

const LEAD =
  '“7월 언론 보도와 방송에서는 익숙한 외국어·외래어나 약어를 우리말로 바꾸고, 어려운 전문용어의 뜻을 쉽게 풀어 전달한 다양한 사례가 확인됐습니다. 단순히 외국어를 우리말로 바꾸는 데 그치지 않고, 상황과 맥락에 맞게 보다 정확하고 이해하기 쉬운 표현을 선택한 사례도 눈에 띄었습니다.”'

/** 목차와 각 구역의 제목은 한곳에서 관리해 서로 어긋나지 않게 합니다. */
const SECTIONS = [
  { id: 'sec-1', title: '익숙한 외국어·외래어 대신 우리말로' },
  { id: 'sec-2', title: '어려운 표현을 쉽고 자연스럽게' },
  { id: 'sec-3', title: '약어와 전문용어는 알기 쉽게' },
  { id: 'sec-4', title: '한 단어 대신 뜻을 풀어 쓴 표현' },
  { id: 'sec-5', title: '보다 정확하고 신중한 표현' },
  { id: 'sec-6', title: '방송 속 우리말 & 바른 표현' },
  { id: 'sec-7', title: '우리말로 자리 잡아 가는 표현' },
  { id: 'sec-8', title: '앞으로 눈여겨볼 우리말 표현' },
] as const

type Pair = readonly [from: string, to: string]

const FOREIGN_TO_KOREAN: readonly Pair[] = [
  ['인프라', '기반시설'],
  ['펫 프렌들리', '반려동물 친화'],
  ['플리마켓', '벼룩시장'],
  ['가드너', '정원사'],
  ['롱 폼', '긴 영상'],
]

const PLAINER_WORDING: readonly Pair[] = [
  ['킥오프 회의', '첫 회의'],
  ['퍼실리테이터', '조력자'],
  ['테이프 커팅', '색줄 자르기'],
]

const ABBREVIATIONS: readonly Pair[] = [
  ['DX', '디지털 전환'],
  ['P2P', '개인 간'],
  ['ADR', '주식 예탁증서'],
  ['선행 PER', '이익 대비 주가 수준'],
]

const GLOSSES: readonly Pair[] = [
  ['해피소', '“야외 무더위 대피 공간”'],
  ['학교 이적지', '“폐교하거나 이전한 학교 부지”'],
  ['피지컬 AI', '“현실 공간에서 인간을 대체하는 AI”'],
]

/** 지양할 표현 → 권장 표현 */
const CAREFUL_WORDING: readonly Pair[] = [
  ['❌ “폭염 사망자가 ○명을 돌파했다”', '⭕ “폭염 사망자가 ○명으로 집계됐다”'],
  ['❌ “마약왕”, “빌라왕”', '⭕ “대규모 마약 조직 총책”, “대규모 전세사기 피의자”'],
]

const BROADCAST_TERMS: readonly Pair[] = [
  ['래플', '추첨 판매'],
  ['백래시', '반발'],
  ['스와팅', '강력 범죄 허위 신고'],
  ['몸뻬', '일 바지(왜바지)'],
]

/** 맞춤법이 헷갈리기 쉬운 표현 */
const SPELLING: readonly Pair[] = [
  ['귓볼', '귓불'],
  ['삐뚤은', '삐뚠'],
]

const SETTLING_IN: readonly Pair[] = [
  ['AI', '인공지능'],
  ['MOU', '업무협약'],
  ['SMR', '소형 모듈 원전'],
  ['IC', '나들목'],
]

/** 마지막 구역의 권장 순화어 — 두 묶음으로 나눠 보여 줍니다. */
const RECOMMENDED: readonly (readonly Pair[])[] = [
  [
    ['로드맵', '이행안'],
    ['모멘텀', '전환 국면'],
    ['플래그십', '대표 상품'],
  ],
  [
    ['피지컬 AI', '실물 인공 지능'],
    ['디지털 트윈', '가상 모형'],
    ['시너지', '상승효과'],
  ],
]

/** 왼쪽(쓰던 말) → 오른쪽(바꾼 말) 비교 카드. */
function SwapCard({ pair, tinted = false }: { pair: Pair; tinted?: boolean }) {
  return (
    <div className={`${styles.card} ${tinted ? styles.swapTinted : ''}`}>
      <div className={styles.swapRow}>
        <span className={styles.swapFrom}>{pair[0]}</span>
        <Icon name="arrow_forward" className={styles.swapArrow} />
        <span className={styles.swapTo}>{pair[1]}</span>
      </div>
    </div>
  )
}

/** 위아래로 쌓은 라벨 → 값 카드. */
function StackCard({ pair, centered = false }: { pair: Pair; centered?: boolean }) {
  return (
    <div className={centered ? styles.stackCenter : styles.stackCard}>
      <div className={styles.stackFrom}>{pair[0]}</div>
      <div className={styles.stackTo}>{pair[1]}</div>
    </div>
  )
}

function ExemplaryCaseJul2026() {
  return (
    <article className={styles.article}>
      <header className={styles.banner}>
        <span className={styles.monthBadge}>2026년 7월</span>
        <h2 className={styles.bannerTitle}>쉽고 바른 우리말 우수사례</h2>
        <div className={styles.leadBox}>
          <p className={styles.lead}>{LEAD}</p>
        </div>
      </header>

      <div className={styles.layout}>
        <nav className={styles.toc} aria-label="목차 바로가기">
          <div className={styles.tocHead}>
            <Icon name="list_alt" />
            목차 바로가기
          </div>
          <ul className={styles.tocList}>
            {SECTIONS.map((section) => (
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
          <section className={styles.section} id={SECTIONS[0].id}>
            <h3 className={styles.sectionTitle}>{SECTIONS[0].title}</h3>
            <p className={styles.sectionLead}>
              언론에서 익숙하게 사용되던 외국어·외래어 표현을 우리말로 바꾸어 보다 쉽고 친근하게
              전달한 보도 사례들입니다.
            </p>
            <div className={styles.grid2}>
              {FOREIGN_TO_KOREAN.map((pair) => (
                <SwapCard key={pair[0]} pair={pair} tinted />
              ))}
            </div>
          </section>

          {/* 2 — 어려운 표현을 쉽고 자연스럽게 */}
          <section className={styles.section} id={SECTIONS[1].id}>
            <h3 className={styles.sectionTitle}>{SECTIONS[1].title}</h3>
            <p className={styles.sectionLead}>
              언론 보도에서 관행적으로 사용되지만 일반 독자에게는 다소 낯설 수 있는 표현을 일상적인
              우리말로 풀어 쓴 사례도 있었습니다. 원래 의미를 유지하면서 보다 쉽고 친숙한 표현으로
              전달한 점이 돋보였습니다.
            </p>
            <div className={styles.grid3}>
              {PLAINER_WORDING.map((pair) => (
                <StackCard key={pair[0]} pair={pair} />
              ))}
            </div>
          </section>

          {/* 3 — 약어와 전문용어는 알기 쉽게 */}
          <section className={styles.section} id={SECTIONS[2].id}>
            <h3 className={styles.sectionTitle}>{SECTIONS[2].title}</h3>
            <p className={styles.sectionLead}>
              경제·기술 분야에서는 약어나 전문용어를 알기 쉬운 우리말로 풀어 쓴 사례가
              돋보였습니다.
            </p>
            <div className={styles.grid2}>
              {ABBREVIATIONS.map((pair) => (
                <StackCard key={pair[0]} pair={pair} />
              ))}
            </div>
          </section>

          {/* 4 — 한 단어 대신 뜻을 풀어 쓴 표현 */}
          <section className={styles.section} id={SECTIONS[3].id}>
            <h3 className={styles.sectionTitle}>{SECTIONS[3].title}</h3>
            <p className={styles.sectionLead}>
              한자어나 축약된 표현을 새로 만들기보다, 직관적인 문장형 설명이나 풀이말을 사용해
              의미를 쉽게 전달한 사례입니다.
            </p>
            <div className={styles.glossList}>
              {GLOSSES.map((pair) => (
                <div key={pair[0]} className={styles.glossRow}>
                  <h4 className={styles.glossTerm}>{pair[0]}</h4>
                  <span className={styles.glossMeaning}>{pair[1]}</span>
                </div>
              ))}
            </div>
          </section>

          {/* 5 — 보다 정확하고 신중한 표현 */}
          <section className={styles.section} id={SECTIONS[4].id}>
            <h3 className={styles.sectionTitle}>{SECTIONS[4].title}</h3>
            <p className={styles.sectionLead}>
              재난이나 범죄 보도에서 자극적인 표현이나 가해자를 미화할 수 있는 별칭 대신, 사실을
              정확하게 전달하는 절제된 표현을 사용한 사례입니다.
            </p>
            <div className={styles.grid2}>
              {CAREFUL_WORDING.map((pair) => (
                <div key={pair[0]} className={styles.adviceCard}>
                  <span className={styles.adviceAvoid}>{pair[0]}</span>
                  <span className={styles.adviceUse}>{pair[1]}</span>
                </div>
              ))}
            </div>
            <div className={styles.noteCard}>
              <h4 className={styles.noteTitle}>세대·장애 비하 일상어 점검</h4>
              <p className={styles.noteBody}>
                온라인과 방송에서 유행어처럼 쓰이는 ‘잼민이’(어린이를 낮잡아 이르는 표현),
                ‘영포티’(특정 연령대를 부정적으로 지칭하는 표현), ‘결정 장애’(선택의 어려움을 질환에
                빗댄 표현) 등을 살펴보고, 이러한 표현에 담긴 비하·차별적 의미를 짚어보며 다른 표현을
                함께 생각해 보는 내용도 다뤄졌습니다.
              </p>
            </div>
          </section>

          {/* 6 — 방송 속 우리말 & 바른 표현 */}
          <section className={styles.section} id={SECTIONS[5].id}>
            <h3 className={styles.sectionTitle}>{SECTIONS[5].title}</h3>
            <p className={styles.sectionLead}>
              일상에서 자주 접하는 외래어나 잘못 쓰기 쉬운 표현을 다룬 사례입니다.
            </p>
            <div className={styles.grid2}>
              {BROADCAST_TERMS.map((pair) => (
                <SwapCard key={pair[0]} pair={pair} />
              ))}
            </div>
            {/* 맞춤법이 헷갈리기 쉬운 표현은 원본처럼 따로 묶었습니다. */}
            <div className={`${styles.grid2} ${styles.gridGap}`}>
              {SPELLING.map((pair) => (
                <SwapCard key={pair[0]} pair={pair} />
              ))}
            </div>
          </section>

          {/* 7 — 우리말로 자리 잡아 가는 표현 */}
          <section className={styles.section} id={SECTIONS[6].id}>
            <h3 className={styles.sectionTitle}>{SECTIONS[6].title}</h3>
            <p className={styles.sectionLead}>
              외국어나 영문 약어 대신 우리말 표현이 언론에서 꾸준히 사용되면서{' '}
              <strong>우리말 표현으로 자리 잡아 가는 사례</strong>도 확인하였습니다.
            </p>
            <div className={styles.grid4}>
              {SETTLING_IN.map((pair) => (
                <StackCard key={pair[0]} pair={pair} centered />
              ))}
            </div>
          </section>

          {/* 8 — 앞으로 눈여겨볼 우리말 표현 */}
          <section className={styles.section} id={SECTIONS[7].id}>
            <h3 className={styles.sectionTitle}>{SECTIONS[7].title}</h3>
            <div className={styles.calloutBanner}>
              <div className={styles.calloutHead}>
                <Icon name="campaign" className={styles.calloutIcon} />
                <h4 className={styles.calloutTitle}>적극 권장 순화어</h4>
              </div>
              <p className={styles.calloutLead}>
                일부 기사에서는 우리말로 풀어 쓴 사례도 확인되었지만, 아직 우리말 표현이 널리
                사용되지는 않고 있습니다.
              </p>
              <div className={styles.calloutColumns}>
                {RECOMMENDED.map((group) => (
                  <div key={group[0][0]} className={styles.calloutGroup}>
                    {group.map((pair) => (
                      <div key={pair[0]} className={styles.calloutRow}>
                        <span className={styles.calloutFrom}>{pair[0]}</span>
                        <span className={styles.calloutTo}>{pair[1]}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </article>
  )
}

export default ExemplaryCaseJul2026
