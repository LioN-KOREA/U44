import AwardSummaryCard from '../components/AwardSummaryCard'
import Icon from '../components/Icon'
import Reveal from '../components/Reveal'
import { Link } from 'react-router'
import { paths } from '../navigation'
import { AWARDS_CONFIG } from '../data/awards'
import {
  findAward,
  formatCeremonyLong,
  formatMonthRange,
  scheduleRows,
  parseAwardSchedule,
} from '../data/schedules'
import { useConfig } from '../hooks/useConfig'
import styles from './IntroductionPage.module.css'

const PORTRAIT_SRC =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDAQZ68bcFA0mgXX1hURnffP1UhbNmYuxa1qUSnU7Zvgf9uG3AtQ5xMGEE_2kHhIGuIqCzI3ZpAJFxj97yiZaisl8Q6ko2dQjW49xGwexQgsNjbtFOKG0Jl8C2pF7bIbrKicu1_LbAzGEYLvq7ar5clV1Quak3IEijMisYCxX9Qz8U7Ecmd2nvJS_RKM-9RidhNZujin7YXd6AocrW3V-BjvLTpYynFVl51W5pyHEtmHQurwQt9bKWv_7oVWg_cxU-RfVTujS1eYw'

const ELIGIBILITY = [
  { title: '대상', body: '기자·피디(PD)·아나운서' },
  {
    title: '대상 보도',
    body: '외국어나 어려운 표현을 쉽고 자연스러운 우리말로 바꾸어 사용한 기사·방송',
  },
  { title: '대상 매체', body: '신문·통신·지상파·종합편성채널·전문지 등 모든 언론 매체' },
]

const DIVISIONS = [
  { icon: 'edit_square', title: '기자 부문', note: '신문/통신' },
  { icon: 'videocam', title: '피디(PD) 부문', note: '방송/콘텐츠' },
  { icon: 'mic', title: '아나운서 부문', note: '방송/보도·진행' },
]

const METRICS = [
  {
    title: '우리말 기여도',
    body: (
      <>
        어려운 용어를 쉽게 이해할 수 있는 우리말로 바꾸거나 설명하고,
        <br />
        매체와 맥락에 맞게 정확하고 자연스럽게 활용한 정도
      </>
    ),
  },
  {
    title: '우리말 쓰기 확산',
    body: (
      <>
        누구나 쉽게 이해하고, 다른 언론에도 모범이 되도록
        <br />
        우리말을 일관되게 사용한 정도
      </>
    ),
  },
  {
    title: '우리말 활용 의지와 실천',
    body: (
      <>
        우리말 개선 용어를 사용한 기획 의도와 활용 노력,
        <br />
        우리말 관련 활동 실적 및 언어문화 개선 기여도
      </>
    ),
  },
]

const PROCESS = [
  {
    number: '01',
    title: '정량 심사',
    body: (
      <>
        인공지능·자료 분석을 통해
        <br />
        외국어나 어려운 표현을
        <br />
        우리말 개선 용어로 바꾸어
        <br />
        사용한 정도를 정량적으로 평가합니다.
      </>
    ),
  },
  {
    number: '02',
    title: '정성 심사',
    body: (
      <>
        언론학·국어학 교수와
        <br />
        언론인으로 구성된 심사위원이
        <br />
        전문적인 심층 평가를 진행합니다.
      </>
    ),
  },
  {
    number: '03',
    title: '최종 선정',
    body: (
      <>
        수치화된 자료와
        <br />
        심사위원 의견을 종합하여
        <br />
        수상자를 확정합니다.
      </>
    ),
  },
]

const NOTES = [
  '후보 보도는 우리말을 쉽고 바르게 사용한 보도에 한합니다.',
  '추천인 및 수상 후보자는 심사에 필요한 경우 사무국이 요청하는 추가 자료 제출에 협조하여야 합니다.',
  '동일한 후보에 대한 중복 추천은 심사 결과에 영향을 미치지 않습니다.',
]

/** 원본 award-info.html — 시상식 안내 */
function IntroductionPage() {
  // 일정은 홈·수상자 화면과 같은 시상식 설정에서 만듭니다 (늘 같은 내용을 보여 주도록).
  const schedules = useConfig(AWARDS_CONFIG, parseAwardSchedule)
  const monthly = schedules.data ? findAward(schedules.data, 'monthly') : undefined
  const annual = schedules.data ? findAward(schedules.data, 'annual') : undefined

  return (
    <main>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <h1 className={styles.heroTitle}>시상식 안내</h1>
          <p className={styles.heroLead}>
            기사와 방송에서 우리말 개선 용어를
            <br />
            적극적으로 사용한 언론인을 선정해 시상합니다.
          </p>
        </div>
      </section>

      {/* 시상 일정 */}
      <section className={styles.schedule}>
        <Reveal>
          <h2 className={styles.heading}>시상 일정</h2>
          <div className={styles.rule} />

          {schedules.error && <p className={styles.scheduleError}>{schedules.error}</p>}

          <div className={styles.scheduleGrid}>
            {monthly && (
              <div className={styles.monthlyCard}>
                <div>
                  <div className={styles.cardHead}>
                    <span className={styles.cardEyebrow}>{formatMonthRange(monthly)}</span>
                    <Icon name="calendar_today" className={styles.cardIcon} />
                  </div>
                  <h3 className={styles.cardTitle}>{monthly.title}</h3>
                  <p className={styles.cardBody}>
                    우리말 사용의 모범이 되는 우수 보도를 선정해 매월 시상합니다.
                  </p>
                </div>
                <ul className={styles.monthList}>
                  {scheduleRows(monthly).map((row) => (
                    <li key={row.key} className={styles.monthRow}>
                      <span className={styles.monthLabel}>{row.month}</span>
                      <span className={styles.monthWhen}>{formatCeremonyLong(row.ceremony)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {annual && (
              <div className={styles.annualCard}>
                <div>
                  <div className={styles.cardHead}>
                    <span className={styles.cardEyebrowGold}>{formatMonthRange(annual)}</span>
                    <Icon name="workspace_premium" className={styles.cardIcon} filled />
                  </div>
                  <h3 className={styles.cardTitleGold}>{annual.title}</h3>
                  <p className={styles.cardBodyLight}>
                    각 부문에서 가장 뛰어난 성취를 보여준 보도와 언론인을
                    <br />
                    최종 선정합니다.
                  </p>
                </div>
                <ul className={styles.monthListLight}>
                  {scheduleRows(annual).map((row) => (
                    <li key={row.key} className={styles.monthRowLight}>
                      <span className={styles.monthLabelLight}>{row.month}</span>
                      <span className={styles.monthWhenLight}>{formatCeremonyLong(row.ceremony)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <AwardSummaryCard />
        </Reveal>
      </section>

      {/* 추천 대상 */}
      <section className={styles.eligibility}>
        <Reveal className={styles.eligibilityInner}>
          <div className={styles.eligibilityGrid}>
            <div className={styles.portraitWrap}>
              <div className={styles.portrait}>
                <img className={styles.portraitImage} src={PORTRAIT_SRC} alt="현직 언론인" />
              </div>
              <div className={styles.portraitCaption}>
                <p className={styles.portraitCaptionText}>
                  쉬운 우리말로
                  <br />
                  세상을 밝히는 언론
                </p>
              </div>
            </div>

            <div className={styles.eligibilityCopy}>
              <h2 className={styles.eligibilityHeading}>추천 대상</h2>
              <p className={styles.eligibilityLead}>
                기사와 방송에서 우리말 개선 용어를
                <br />
                적극적으로 사용한 현직 언론인을 추천해 주세요.
              </p>
              <ul className={styles.eligibilityList}>
                {ELIGIBILITY.map((item) => (
                  <li key={item.title} className={styles.eligibilityItem}>
                    <Icon name="check_circle" className={styles.checkIcon} />
                    <div>
                      <h4 className={styles.eligibilityItemTitle}>{item.title}</h4>
                      <p className={styles.eligibilityItemBody}>{item.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </section>

      {/* 접수 방법 */}
      <section className={styles.submission}>
        <Reveal className={styles.centeredHead}>
          <h2 className={styles.centeredHeading}>접수 방법</h2>
          <p className={styles.centeredLead}>누구나 간편하게 훌륭한 보도를 추천할 수 있습니다.</p>
        </Reveal>

        <Reveal className={styles.submissionGrid}>
          <div className={styles.submissionCard}>
            <div className={styles.submissionIcon}>
              <Icon name="app_registration" />
            </div>
            <h3 className={styles.submissionTitle}>온라인 추천</h3>
            <p className={styles.submissionBody}>
              추천 양식을 작성해
              <br />
              온라인으로 간편하게 추천합니다.
            </p>
            <Link to={paths.nomination} className={styles.submissionNavy}>
              추천하기
            </Link>
          </div>

          <div className={styles.submissionCard}>
            <div className={styles.submissionIcon}>
              <Icon name="mail" />
            </div>
            <h3 className={styles.submissionTitle}>메일 추천</h3>
            <p className={styles.submissionBody}>
              추천서 양식에 맞게 작성 후
              <br />
              메일로 후보를 추천합니다.
            </p>
            {/*
              파일 이름은 영문으로 두고, 내려받을 때만 한글 이름으로 저장되게 합니다.
              (Windows 의 Node 24 에서 한글 파일 이름이 public 에 있으면 재빌드가 멈춥니다)
            */}
            <a
              className={styles.submissionDownload}
              href="/nomination-form.docx"
              download="추천서_양식.docx"
            >
              추천서 양식 다운로드
            </a>
          </div>
        </Reveal>
      </section>

      {/* 심사 기준 */}
      <section className={styles.criteria}>
        <Reveal className={styles.criteriaInner}>
          <div className={styles.criteriaHead}>
            <h2 className={styles.centeredHeading}>심사 기준</h2>
          </div>

          <div className={styles.criteriaColumns}>
            <div className={styles.column}>
              <div className={styles.columnHead}>
                <Icon name="groups" className={styles.columnIcon} filled />
                <h3 className={styles.columnTitle}>대상 부문</h3>
                <span className={styles.columnDivider} />
                <span className={styles.columnDot} />
              </div>
              <div className={styles.columnRows}>
                {DIVISIONS.map((division) => (
                  <div key={division.title} className={styles.divisionCard}>
                    <span className={styles.divisionAccent} />
                    <div className={styles.divisionIcon}>
                      <Icon name={division.icon} className={styles.divisionIconGlyph} />
                    </div>
                    <div className={styles.divisionSeparator} />
                    <div>
                      <h4 className={styles.divisionTitle}>{division.title}</h4>
                      <p className={styles.divisionNote}>{division.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.column}>
              <div className={styles.columnHead}>
                <Icon name="assignment" className={styles.columnIcon} />
                <h3 className={styles.columnTitle}>평가항목</h3>
                <span className={styles.columnDivider} />
                <span className={styles.columnDot} />
              </div>
              <ul className={styles.columnRows}>
                {METRICS.map((metric, index) => (
                  <li key={metric.title} className={styles.metricCard}>
                    <span className={styles.metricNumber}>{index + 1}</span>
                    <span className={styles.metricSeparator} />
                    <div>
                      <h4 className={styles.metricTitle}>{metric.title}</h4>
                      <p className={styles.metricBody}>{metric.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </section>

      {/* 심사 절차 */}
      <section className={styles.process}>
        <div className={styles.processInner}>
          <Reveal className={styles.centeredHead}>
            <h2 className={styles.centeredHeading}>심사 절차</h2>
          </Reveal>

          <Reveal className={styles.processTrack}>
            <div className={styles.processLine} />
            <div className={styles.processGrid}>
              {PROCESS.map((step) => (
                <div
                  key={step.number}
                  className={[styles.processCard, step.number === '02' && styles.processCardOffset]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div className={styles.processNumber}>{step.number}</div>
                  <h4 className={styles.processTitle}>{step.title}</h4>
                  <p className={styles.processBody}>{step.body}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* 유의 사항 */}
      <section className={styles.notes}>
        <Reveal className={styles.notesGrid}>
          <div>
            <h2 className={styles.centeredHeading} style={{ textAlign: 'left' }}>
              유의 사항
            </h2>
          </div>
          <div>
            <div className={styles.notesCard}>
              <div className={styles.notesList}>
                {NOTES.map((note, index) => (
                  <div key={note} className={styles.noteRow}>
                    <span className={styles.noteIndex}>{String(index + 1).padStart(2, '0')}</span>
                    <p className={styles.noteBody}>{note}</p>
                  </div>
                ))}
              </div>

              <div className={styles.notesFoot}>
                <div>
                  <p className={styles.notesFootLabel}>시상식 사무국</p>
                  <p className={styles.notesFootMail}>kplain.urimal@gmail.com</p>
                </div>
                <Link to={paths.nomination} className={styles.notesFootButton}>
                  추천하기
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </main>
  )
}

export default IntroductionPage
