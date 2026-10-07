import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import AwardCeremonyCard from '../components/AwardCeremonyCard'
import Icon from '../components/Icon'
import NominationCta from '../components/NominationCta'
import Reveal from '../components/Reveal'
import { useAwardCeremonies } from '../hooks/useAwardCeremonies'
import type { AwardCeremony } from '../data/awards'
import { paths } from '../navigation'
import { SOCIAL_MEDIA_CONFIG, parseSocialMedia } from '../data/socialMedia'
import { useConfig } from '../hooks/useConfig'
import AwardCeremonyDetail from './AwardCeremonyDetail'
import styles from './WinnersPage.module.css'
import { ThumbnailedImageCard } from '../components/ThumbnailedImageCard'

const PAGE_SIZE = 8

type SortOrder = 'latest' | 'oldest'

/** 검색어가 시상식 제목·부문·수상자 이름·소속 중 하나에 걸리는지 확인합니다. */
function matchesQuery(ceremony: AwardCeremony, needle: string): boolean {
  if (!needle) return true
  const haystack = [
    ceremony.title,
    `${ceremony.year}`,
    `${ceremony.month}월`,
    ...ceremony.sections.flatMap((section) => [
      section.section,
      ...section.winners.flatMap((winner) => [winner.name, winner.affiliation]),
    ]),
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(needle)
}

/** 원본 gallery.html + 시안 기준의 우리말 수상자 화면 (목록 / 상세). */
function WinnersPage() {
  // 주소의 /winners/:ceremonyId 에서 회차를 읽습니다. 없으면 목록을 보여 줍니다.
  const { ceremonyId } = useParams()
  const selectedCeremonyId = ceremonyId ?? null
  const { ceremonies, loading, error } = useAwardCeremonies()
  const socialMedia = useConfig(SOCIAL_MEDIA_CONFIG, parseSocialMedia)
  const [year, setYear] = useState('all')
  const [query, setQuery] = useState('')
  const [order, setOrder] = useState<SortOrder>('latest')
  const [page, setPage] = useState(1)

  const years = useMemo(
    () => [...new Set(ceremonies.map((ceremony) => ceremony.year))].sort((a, b) => b - a),
    [ceremonies],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = ceremonies.filter(
      (ceremony) =>
        (year === 'all' || String(ceremony.year) === year) && matchesQuery(ceremony, needle),
    )
    // data/awards.ts 에서 이미 최신순으로 정렬해 두었으므로 오래된순만 뒤집습니다.
    return order === 'latest' ? list : [...list].reverse()
  }, [ceremonies, year, query, order])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const selected = selectedCeremonyId
    ? (ceremonies.find((ceremony) => ceremony.id === selectedCeremonyId) ?? null)
    : null

  // 상세 화면: 자료를 아직 읽는 중이면 안내만 보여 줍니다.
  if (selectedCeremonyId) {
    if (loading) {
      return (
        <main className={styles.main}>
          <p className={styles.status}>시상식 자료를 불러오는 중입니다…</p>
        </main>
      )
    }
    if (!selected) {
      return (
        <main className={styles.main}>
          <div className={styles.list}>
            <p className={styles.statusError}>
              {error ?? '해당 회차의 시상식 자료를 찾을 수 없습니다.'}
            </p>
            <p className={styles.status}>
              <Link to={paths.winners} className={styles.inviteButton}>
                <Icon name="arrow_back" />
                목록으로 돌아가기
              </Link>
            </p>
          </div>
        </main>
      )
    }

    const index = ceremonies.indexOf(selected)
    return (
      <main className={styles.main}>
        <AwardCeremonyDetail
          ceremony={selected}
          previous={ceremonies[index + 1] ?? null}
          next={ceremonies[index - 1] ?? null}
        />
      </main>
    )
  }

  return (
    <>
      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <h1 className={styles.heroTitle}>우리말 수상자</h1>
            <p className={styles.heroLead}>
              우리말의 아름다움을 지키고 바른 언어 문화를 확산시킨
              <br />
              언론인들의 발자취를 기록합니다.
            </p>
          </div>
        </section>

        <section className={styles.list}>
          <div className={styles.controls}>
            <select
              className={styles.select}
              value={year}
              aria-label="연도 선택"
              onChange={(event) => {
                setYear(event.target.value)
                setPage(1)
              }}
            >
              <option value="all">전체 연도</option>
              {years.map((value) => (
                <option key={value} value={String(value)}>
                  {value}년
                </option>
              ))}
            </select>

            <div className={styles.controlsRight}>
              <div className={styles.searchWrap}>
                <input
                  className={styles.searchInput}
                  type="text"
                  value={query}
                  placeholder="검색어를 입력해주세요"
                  aria-label="시상식·수상자 검색"
                  onChange={(event) => {
                    setQuery(event.target.value)
                    setPage(1)
                  }}
                />
                <Icon name="search" className={styles.searchIcon} />
              </div>

              <select
                className={styles.select}
                value={order}
                aria-label="정렬 순서"
                onChange={(event) => {
                  setOrder(event.target.value as SortOrder)
                  setPage(1)
                }}
              >
                <option value="latest">최신순</option>
                <option value="oldest">오래된순</option>
              </select>
            </div>
          </div>

          {loading && (
            <div className={styles.skeletonGrid} aria-hidden="true">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className={styles.skeleton} />
              ))}
            </div>
          )}

          {!loading && error && <p className={styles.statusError}>{error}</p>}

          {!loading && !error && filtered.length === 0 && (
            <p className={styles.status}>조건에 맞는 시상식 기록이 없습니다.</p>
          )}

          {!loading && !error && filtered.length > 0 && (
            <Reveal className={styles.grid} immediate>
              {visible.map((ceremony) => (
                <AwardCeremonyCard key={ceremony.id} ceremony={ceremony} />
              ))}
            </Reveal>
          )}

          {totalPages > 1 && (
            <div className={styles.pagination}>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => (
                <button
                  key={number}
                  type="button"
                  className={number === currentPage ? styles.pageBtnActive : styles.pageBtn}
                  aria-current={number === currentPage ? 'page' : undefined}
                  onClick={() => setPage(number)}
                >
                  {number}
                </button>
              ))}
              <button
                type="button"
                className={styles.pageBtn}
                disabled={currentPage === totalPages}
                aria-label="다음 페이지"
                onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
              >
                <Icon name="chevron_right" />
              </button>
            </div>
          )}
        </section>

        <section className={styles.social}>
          {socialMedia.error && <p className={styles.statusError}>{socialMedia.error}</p>}

          {/*
            등록된 글이 없으면 칸을 아예 그리지 않습니다. 제목과 '더 보기'만 남은 빈 칸은
            아직 준비되지 않았다는 뜻으로 읽히기보다 고장난 것처럼 보입니다.
          */}
          {socialMedia.data && socialMedia.data.posts.length > 0 && (
            <>
              <Reveal className={styles.socialHead}>
                <Icon name="photo_camera" className={styles.socialIcon} />
                <h2 className={styles.socialTitle}>누리소통망(SNS)</h2>
                {socialMedia.data.handle && socialMedia.data.profileURL && (
                  <a
                    className={styles.socialHandle}
                    href={socialMedia.data.profileURL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {socialMedia.data.handle}
                  </a>
                )}
              </Reveal>

              <div className={styles.postGrid}>
                {/*
                  자리(index)를 열쇠로 씁니다. 관리 화면에서 두 글이 같은 사진을 고를 수 있어
                  사진 주소는 고유하지 않고, 글 주소도 마찬가지로 겹칠 수 있습니다.
                */}
                {socialMedia.data.posts.map((post, index) => (
                  <a
                    key={index}
                    className={styles.post}
                    href={post.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ThumbnailedImageCard
                      rawImagePath={post.image}
                      altImagePath={post.altText}
                      className={styles.postImage}
                      sizes="(min-width: 768px) 320px, 45vw"
                    />
                    <div className={styles.postOverlay}>
                      <Icon name="open_in_new" className={styles.postOverlayIcon} />
                    </div>
                  </a>
                ))}
              </div>

              {socialMedia.data.profileURL && (
                <div className={styles.moreWrap}>
                  <a
                    className={styles.moreLink}
                    href={socialMedia.data.profileURL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon name="photo_camera" className={styles.moreIcon} />
                    누리소통망(SNS)에서 더 보기
                  </a>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      <NominationCta
        title="우리말의 품격을 높인 언론인을 추천해주세요"
        body={
          <>
            일상의 언어를 가다듬고 올바른 정보를 전달하는 일,
            <br />그 가치 있는 노력을 공정한 심사를 통해 예우합니다.
          </>
        }
        buttonLabel="추천하러 가기"
        withGlow
      />
    </>
  )
}

export default WinnersPage
