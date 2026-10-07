import { useMemo, useRef, useState } from 'react'
import Icon from '../components/Icon'
import Reveal from '../components/Reveal'
import { TERM_PAIRS, type TermPair } from '../data/terms'
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

/** 원본은 정적 마크업을 런타임에 정렬했습니다. 여기서는 모듈 로드 시 한 번만 계산합니다. */
const ALL_TERMS: GlossaryTerm[] = TERM_PAIRS.map(([foreign, korean]: TermPair) => ({
  foreign,
  korean,
  category: categoryOf(foreign.replace(/^\d+\.\s*/, '').trim()),
})).sort((a, b) => collator.compare(a.foreign, b.foreign))

/** 원본 terms.html — 우리말 개선 용어 */
function GlossaryPage() {
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const gridRef = useRef<HTMLDivElement | null>(null)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return ALL_TERMS.filter((term) => {
      if (filter !== 'all' && term.category !== filter) return false
      if (!needle) return true
      return (
        term.foreign.toLowerCase().includes(needle) || term.korean.toLowerCase().includes(needle)
      )
    })
  }, [filter, query])

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

            {filtered.length === 0 && <p className={styles.emptyState}>검색 결과가 없습니다.</p>}

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
