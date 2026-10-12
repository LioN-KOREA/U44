import { Link, useParams } from 'react-router'
import Icon from '../components/Icon'
import Reveal from '../components/Reveal'
import ExemplaryCaseTemplate from './exemplaryCases/ExemplaryCaseTemplate'
import {
  EXEMPLARY_CASES_CONFIG,
  findExemplaryCase,
  parseExemplaryCases,
  type ExemplaryCase,
} from '../data/exemplaryCases'
import { useConfig } from '../hooks/useConfig'
import { paths } from '../navigation'
import styles from './ExemplaryCasesPage.module.css'

/** 불러오는 동안 쓸 빈 목록. 렌더마다 새 배열을 만들면 쓰는 쪽이 매번 다시 계산합니다. */
const NO_CASES: ExemplaryCase[] = []

/**
 * 우리말 우수사례 화면 (목록 / 상세).
 *
 * 회차마다 글은 달라도 짜임새는 같아졌습니다. 그래서 본문은 설정에서 받아 와 공용 틀로 그리고
 * (ExemplaryCaseTemplate), 이 페이지는 '어떤 회차가 있는지'와 '뒤로 가기·앞뒤 이동'만 맡습니다.
 */
function ExemplaryCasesPage() {
  // 주소의 /examples/:caseId 에서 회차를 읽습니다. 없으면 목록을 보여 줍니다.
  const { caseId } = useParams()
  const { data, loading, error } = useConfig(EXEMPLARY_CASES_CONFIG, parseExemplaryCases)
  const cases = data ?? NO_CASES

  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <h1 className={styles.heroTitle}>우리말 우수사례</h1>
          <p className={styles.heroLead}>
            쉽고 바른 우리말 언론인상 수상자들의 우수한 우리말 사용 사례를 소개합니다.
          </p>
        </div>
      </section>

      <section className={styles.content} aria-label="월별 우수사례">
        {error && <p className={styles.empty}>{error}</p>}
        {loading && !error && <p className={styles.empty}>불러오는 중입니다…</p>}
        {!loading && !error && (
          caseId ? (
            <CaseDetail selected={findExemplaryCase(cases, caseId)} cases={cases} />
          ) : (
            <CaseList cases={cases} />
          )
        )}
      </section>
    </main>
  )
}

/** 회차 목록. */
function CaseList({ cases }: { cases: readonly ExemplaryCase[] }) {
  if (cases.length === 0) {
    return <p className={styles.empty}>등록된 우수사례가 없습니다.</p>
  }

  return (
    <Reveal immediate>
      <h2 className={styles.sectionTitle}>월별 우수사례</h2>
      <ul className={styles.monthList}>
        {cases.map((item) => (
          <li key={item.id}>
            <Link
              to={paths.exemplaryCase(item.id)}
              className={styles.monthRow}
              aria-label={`${item.title} 보기`}
            >
              <span className={styles.monthDate}>
                {item.year}.{String(item.month).padStart(2, '0')}
              </span>
              <span className={styles.monthTitle}>{item.title}</span>
              <Icon name="arrow_forward" className={styles.monthArrow} />
            </Link>
          </li>
        ))}
      </ul>
    </Reveal>
  )
}

/** 회차 상세. 본문은 그 달 전용 컴포넌트가 그립니다. */
function CaseDetail({
  selected,
  cases,
}: {
  selected: ExemplaryCase | null
  cases: readonly ExemplaryCase[]
}) {
  if (!selected) {
    return (
      <>
        <Link to={paths.examples} className={styles.backButton}>
          <Icon name="arrow_back" />
          목록으로 돌아가기
        </Link>
        <p className={styles.notFound}>해당 회차의 자료를 찾을 수 없습니다.</p>
      </>
    )
  }

  // 목록은 최신순이므로 다음 항목이 '이전 회차'가 됩니다.
  const index = cases.indexOf(selected)
  const previous = cases[index + 1] ?? null
  const next = cases[index - 1] ?? null

  return (
    <>
      <div className={styles.detailTopBar}>
        <Link to={paths.examples} className={styles.backButton}>
          <Icon name="arrow_back" />
          목록으로 돌아가기
        </Link>

        <nav className={styles.breadcrumb} aria-label="현재 위치">
          <Link to={paths.home} className={styles.breadcrumbLink}>
            홈
          </Link>
          <Icon name="chevron_right" className={styles.breadcrumbSep} />
          <Link to={paths.examples} className={styles.breadcrumbLink}>
            우리말 우수사례
          </Link>
          <Icon name="chevron_right" className={styles.breadcrumbSep} />
          <span className={styles.breadcrumbCurrent}>{selected.title}</span>
        </nav>
      </div>

      <ExemplaryCaseTemplate data={selected} />

      {/* 앞뒤 회차가 있으면 링크, 없으면 누를 수 없는 단추로 둡니다. */}
      <div className={styles.pager}>
        {previous ? (
          <Link to={paths.exemplaryCase(previous.id)} className={styles.pagerButton}>
            <Icon name="chevron_left" className={styles.pagerIcon} />
            <span>
              <span className={styles.pagerLabel}>이전 회차</span>
              <span className={styles.pagerTitle}>{previous.title}</span>
            </span>
          </Link>
        ) : (
          <button type="button" className={styles.pagerButton} disabled>
            <Icon name="chevron_left" className={styles.pagerIcon} />
            <span>
              <span className={styles.pagerLabel}>이전 회차</span>
              <span className={styles.pagerTitle}>이전 회차 없음</span>
            </span>
          </button>
        )}

        <Link to={paths.examples} className={styles.pagerCenter}>
          <Icon name="format_list_bulleted" />
          목록으로 돌아가기
        </Link>

        {next ? (
          <Link to={paths.exemplaryCase(next.id)} className={styles.pagerNext}>
            <span>
              <span className={styles.pagerLabel}>다음 회차</span>
              <span className={styles.pagerTitle}>{next.title}</span>
            </span>
            <Icon name="chevron_right" className={styles.pagerIcon} />
          </Link>
        ) : (
          <button type="button" className={styles.pagerNext} disabled>
            <span>
              <span className={styles.pagerLabel}>다음 회차</span>
              <span className={styles.pagerTitle}>다음 회차 없음</span>
            </span>
            <Icon name="chevron_right" className={styles.pagerIcon} />
          </button>
        )}
      </div>
    </>
  )
}

export default ExemplaryCasesPage
