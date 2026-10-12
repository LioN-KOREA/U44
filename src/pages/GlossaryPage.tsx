import { useMemo, useRef, useState } from 'react'
import Icon from '../components/Icon'
import Reveal from '../components/Reveal'
import { GLOSSARY_CONFIG, parseGlossary, type TermPair } from '../data/terms'
import { useConfig } from '../hooks/useConfig'
import styles from './GlossaryPage.module.css'

const PAGE_SIZE = 20
const PAGE_GROUP_SIZE = 5

const FILTERS = [
  { id: 'all', label: '전체' },
  ...['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'].map(
    (initial) => ({ id: initial, label: initial }),
  ),
  { id: '0-9', label: '0~9' },
  { id: 'A-Z', label: 'A~Z' },
  { id: 'etc', label: '기타' },
]

const HANGUL_INITIALS = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
]

/** 쌍자음은 대응하는 단자음 묶음으로 합칩니다. */
const GROUPED_INITIALS: Record<string, string> = {
  ㄲ: 'ㄱ',
  ㄸ: 'ㄷ',
  ㅃ: 'ㅂ',
  ㅆ: 'ㅅ',
  ㅉ: 'ㅈ',
}

/** 용어의 첫 글자로 필터 분류를 구합니다. (원본 getTermCategory) */
function categoryOf(term: string): string {
  const first = term.charAt(0)
  const code = first.charCodeAt(0)

  if (code >= 0xac00 && code <= 0xd7a3) {
    const initial = HANGUL_INITIALS[Math.floor((code - 0xac00) / 588)]
    return GROUPED_INITIALS[initial] ?? initial
  }
  if (/[0-9]/.test(first)) return '0-9'
  if (/[A-Za-z]/.test(first)) return 'A-Z'
  return 'etc'
}

interface GlossaryTerm {
  foreign: string
  korean: string
  category: string
}

const collator = new Intl.Collator('ko-KR', { numeric: true, sensitivity: 'base' })

/** 불러오는 동안 쓸 빈 목록. 렌더마다 새 배열을 만들면 아래 useMemo 가 매번 다시 돕니다. */
const NO_TERMS: GlossaryTerm[] = []

/** 설정에서 받은 낱말을 화면에서 쓰기 좋게 다듬고 가나다순으로 정렬합니다. */
function toTerms(pairs: readonly TermPair[]): GlossaryTerm[] {
  return pairs
    .map((pair) => ({
      foreign: pair.original,
      korean: pair.recommended,
      category: categoryOf(pair.original.replace(/^\d+\.\s*/, '').trim()),
    }))
    .sort((a, b) => collator.compare(a.foreign, b.foreign))
}

/** 원본 terms.html — 우리말 개선 용어 */
function GlossaryPage() {
  const glossary = useConfig(GLOSSARY_CONFIG, parseGlossary)
  /*
   * 정렬과 분류는 낱말이 바뀔 때만 하면 됩니다.
   *
   * 2,500여 개를 거르고 정렬하는 일이라, 검색어를 한 글자 칠 때마다 다시 하면 눈에 띄게 느립니다.
   */
  const allTerms = useMemo(() => (glossary.data ? toTerms(glossary.data) : NO_TERMS), [glossary.data])
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const gridRef = useRef<HTMLDivElement | null>(null)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return allTerms.filter((term) => {
      if (filter !== 'all' && term.category !== filter) return false
      if (!needle) return true
      return (
        term.foreign.toLowerCase().includes(needle) || term.korean.toLowerCase().includes(needle)
      )
    })
  }, [allTerms, filter, query])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  // 필터/검색이 바뀌어 쪽수가 줄면 마지막 쪽으로 당깁니다.
  const currentPage = Math.min(page, totalPages)
  const startIndex = (currentPage - 1) * PAGE_SIZE
  const visible = filtered.slice(startIndex, startIndex + PAGE_SIZE)

  const goToPage = (next: number) => {
    setPage(next)
    gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const groupStart = Math.floor((currentPage - 1) / PAGE_GROUP_SIZE) * PAGE_GROUP_SIZE + 1
  const groupEnd = Math.min(groupStart + PAGE_GROUP_SIZE - 1, totalPages)
  const pageNumbers = Array.from({ length: groupEnd - groupStart + 1 }, (_, i) => groupStart + i)

  const firstItem = filtered.length === 0 ? 0 : startIndex + 1
  const lastItem = Math.min(currentPage * PAGE_SIZE, filtered.length)

  return (
    <main>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <h1 className={styles.heroTitle}>외래어 ↔ 우리말 개선 용어</h1>
          <p className={styles.heroLead}>쉬운 우리말 사용을 돕기 위한 순화어 입니다.</p>
        </div>
      </section>

      <section className={styles.section}>
        <Reveal immediate>
          <div className={styles.panel}>
            <div className={styles.filterWrap} aria-label="언어 보기 필터">
              <div className={styles.filterHead}>
                <h2 className={styles.filterTitle}>언어 보기</h2>
              </div>
              <div className={styles.filter} role="list">
                {FILTERS.map((item) => {
                  const active = filter === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={active ? styles.filterBtnActive : styles.filterBtn}
                      aria-pressed={active}
                      onClick={() => {
                        setFilter(item.id)
                        setPage(1)
                      }}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className={styles.searchWrap}>
              <Icon name="search" className={styles.searchIcon} />
              <input
                className={styles.searchInput}
                type="text"
                value={query}
                placeholder="용어 검색 (예: AI, 인공지능)"
                aria-label="용어 검색"
                onChange={(event) => {
                  setQuery(event.target.value)
                  setPage(1)
                }}
              />
            </div>

            <div className={styles.tableHead} aria-hidden="true">
              <div>외래어</div>
              <div>우리말</div>
              <div>외래어</div>
              <div>우리말</div>
            </div>

            <div className={styles.grid} ref={gridRef}>
              {visible.map((term) => (
                <div key={`${term.foreign}-${term.korean}`} className={styles.card}>
                  <p className={styles.cellForeign}>{term.foreign}</p>
                  <p className={styles.cellKorean}>{term.korean}</p>
                </div>
              ))}
            </div>

            {/*
              아직 받아 오는 중인지, 받아 오지 못했는지, 정말 결과가 없는지를 구분해 줍니다.
              셋 다 '빈 목록' 으로 보이면 사용자는 검색어를 계속 바꿔 보게 됩니다.
            */}
            {glossary.error && <p className={styles.emptyState}>{glossary.error}</p>}
            {glossary.loading && !glossary.error && (
              <p className={styles.emptyState}>용어를 불러오는 중입니다…</p>
            )}
            {!glossary.loading && !glossary.error && filtered.length === 0 && (
              <p className={styles.emptyState}>
                {allTerms.length === 0 ? '등록된 용어가 없습니다.' : '검색 결과가 없습니다.'}
              </p>
            )}

            {filtered.length > 0 && (
              <div className={styles.pagination} aria-label="언어 보기 페이지">
                <div className={styles.pageSummary}>
                  {firstItem}-{lastItem} / {filtered.length}개 항목
                </div>

                <button
                  type="button"
                  className={styles.pageBtn}
                  disabled={currentPage === 1}
                  aria-label="이전 페이지"
                  onClick={() => goToPage(Math.max(1, currentPage - 1))}
                >
                  ‹
                </button>

                {pageNumbers.map((number) => (
                  <button
                    key={number}
                    type="button"
                    className={number === currentPage ? styles.pageBtnActive : styles.pageBtn}
                    aria-current={number === currentPage ? 'page' : undefined}
                    onClick={() => goToPage(number)}
                  >
                    {number}
                  </button>
                ))}

                <button
                  type="button"
                  className={styles.pageBtn}
                  disabled={currentPage === totalPages}
                  aria-label="다음 페이지"
                  onClick={() => goToPage(Math.min(totalPages, currentPage + 1))}
                >
                  ›
                </button>
              </div>
            )}
          </div>
        </Reveal>
      </section>
    </main>
  )
}

export default GlossaryPage
