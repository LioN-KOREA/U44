import Icon from '../../components/Icon'
import styles from './ExemplaryCases.module.css'

/**
 * 2026년 7월 쉽고 바른 우리말 우수사례.
 *
 * 회차마다 본문 구성이 달라 공용 틀을 쓰지 않고, 이 달의 내용만 여기서 직접 그립니다.
 * 내용은 전달받은 2026-07-stitch.html 을 그대로 옮긴 것이며,
 * 서체·색만 본 사이트의 디자인 토큰에 맞췄습니다.
 */

const LEAD =
  '“8월 언론 보도와 방송에서는 외국어와 영문 약어를 익숙한 우리말로 풀어 쓰고, 도로 안전과 방송 현장의 전문용어를 누구나 바로 이해할 수 있는 표현으로 바꾼 사례가 확인됐습니다. 바른 표기와 지역어의 가치를 알리는 등 우리말을 정확하고 풍부하게 전하려는 꾸준한 노력도 돋보였습니다.”'

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
  ['톱티어', '최상위'],
  ['프로토타입', '시제품'],
  ['이 북', '전자책'],
  ['잡 매칭', '일자리 연결'],
  ['매뉴얼·가이드라인', '지침'],
]

const PLAINER_WORDING: readonly Pair[] = [
  ['일소', '햇볕데임'],
  ['마이스', '전시 복합 산업'],
  ['퍼블릭 프로그램', '시민 참여형 문화행사'],
]

const ABBREVIATIONS: readonly Pair[] = [
  ['DX', '디지털 전환'],
  ['AX', '인공지능 전환'],
  ['R&D', '연구개발'],
  ['GRDP', '지역내총생산'],
  ['RE100', '재생에너지 100%'],
  ['NATO', '북대서샹조약기구'],
  ['LNG', '액화천연가스'],
  ['DMZ', '비무장지대'],
]

const GLOSSES: readonly Pair[] = [
  ['싱크홀', '“땅꺼짐 혹은 지반침하”'],
  ['어려운 연금 공백 개념', '“소득 절벽·낀세대 연금”'],
  ['K&R', '“잠시정차구역”'],
  ['노견·노측', '“갓길”'],
]

/** 지양할 표현 → 권장 표현 */
const CAREFUL_WORDING: readonly Pair[] = [
  ['❌ ‘무당층’만 제시', '⭕ ‘지지하는 정당이 없다’는 설명 추가'],
  ['❌ 불필요한 이중피동 표현', '⭕ ‘중요합니다’처럼 간결하게 표현'],
]

const BROADCAST_TERMS: readonly Pair[] = [
  ['3D', '입체'],
  ['다이버', '잠수부'],
  ['리허설', '예행연습'],
  ['리드줄', '목줄'],
  ['켄넬', '이동장'],
  ['빅 픽처', '큰 그림'],
]

/** 맞춤법이 헷갈리기 쉬운 표현 */
const SPELLING: readonly Pair[] = [
]

const SETTLING_IN: readonly Pair[] = [
  ['AI', '인공지능'],
  ['MOU', '업무협약'],
  ['SNS', '사회관계망서비스'],
  ['IC', '나들목'],
]

/** 마지막 구역의 권장 순화어 — 두 묶음으로 나눠 보여 줍니다. */
const RECOMMENDED: readonly (readonly Pair[])[] = [
  [
    ['AX', '인공지능 전환'],
    ['RE100', '재생에너지 100%'],
    ['GRDP', '지역내총생산'],
  ],
  [
    ['K&R', '잠시정차구역'],
    ['퍼블릭 프로그램', '시민 참여형 문화행사'],
    ['빅 픽처', '큰 그림'],
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

function ExemplaryCaseAug2026() {
  return (
    <article className={styles.article}>
      <header className={styles.banner}>
        <span className={styles.monthBadge}>2026년 8월</span>
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
                  주소 해시는 화면 이동에 쓰이고 있어, 목차는 해시를 바꾸지 않고
                  직접 스크롤합니다. (href 는 링크 의미를 남겨 두기 위해 유지)
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
              기사에서 자주 쓰이는 외국어와 외래어를 뜻이 바로 드러나는 우리말로 바꾸어 독자의 이해를 도운 사례입니다.
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
              일반 독자에게 낯설 수 있는 용어를 일상적인 우리말로 풀어 원래 의미를 쉽고 친숙하게 전한 사례입니다.
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
              경제·기술·국제 분야의 영문 약어와 전문용어를 우리말과 함께 제시해 내용을 쉽게 이해하도록 한 사례입니다.
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
              축약된 표현을 새로 만들기보다 문장형 설명이나 풀이말을 사용해 뜻이 바로 드러나도록 했습니다.
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
              설명이 부족하거나 번역투로 굳어진 표현 대신 의미와 상황을 정확하게 전달한 사례입니다.
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
              <h4 className={styles.noteTitle}>지역어와 바른 표현을 친근하게</h4>
              <p className={styles.noteBody}>
                경상도 사투리 ‘가음지르다’를 ‘고함치다’로 풀이하고 사투리를 지역의 문화 자산으로 소개했습니다. ‘되·돼’를 문맥에 맞게 구분하고 ‘에어콘·리모콘’을 ‘에어컨·리모컨’으로 바로잡는 콘텐츠, ‘나타났습니다’ 대신 ‘제시했습니다·파악했습니다’처럼 상황에 맞는 동사를 고른 사례도 확인됐습니다.
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
          <p className={styles.staticSourceNote}>※ 2026년 9월 수상자 명단을 기준으로 8월 심사자료와 제출 추천서·방송 화면에서 확인한 사례를 유형별로 정리했습니다.</p>
        </div>
      </div>
    </article>
  )
}

export default ExemplaryCaseAug2026
