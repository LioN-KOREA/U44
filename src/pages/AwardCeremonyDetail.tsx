import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import Icon from '../components/Icon'
import SafeImage from '../components/SafeImage'
import { formatLongDate, type AwardCeremony, type AwardSection } from '../data/awards'
import { Link } from 'react-router'
import { paths } from '../navigation'
import styles from './AwardCeremonyDetail.module.css'
import { ThumbnailedImageCard } from '../components/ThumbnailedImageCard'

/** 부문 이름에 맞는 아이콘. 알 수 없는 부문은 기본 아이콘을 씁니다. */
const SECTION_ICONS: Record<string, string> = {
  기자: 'edit_square',
  피디: 'videocam',
  PD: 'videocam',
  아나운서: 'mic',
}

/** 확대 보기에서 함께 넘겨 볼 사진 한 장. */
interface LightboxPhoto {
  src: string
  alt: string
}

interface AwardCeremonyDetailProps {
  ceremony: AwardCeremony
  /** 목록 정렬(최신순) 기준의 앞뒤 회차. 없으면 버튼이 비활성화됩니다. */
  previous: AwardCeremony | null
  next: AwardCeremony | null
}

function AwardCeremonyDetail({
  ceremony,
  previous,
  next,
}: AwardCeremonyDetailProps) {
  /*
   * 확대 보기 상태. 사진 한 장이 아니라 '같이 넘겨 볼 사진 묶음 + 현재 위치'를 들고 있어야
   * 이전/다음으로 이동할 수 있습니다. (부문별 수상자 사진, 시상식 현장 사진이 각각 한 묶음)
   */
  const [lightbox, setLightbox] = useState<{ photos: LightboxPhoto[]; index: number } | null>(null)
  const ceremonyDate = formatLongDate(ceremony.ceremonyTime)

  const openLightbox = (photos: LightboxPhoto[], index: number) => setLightbox({ photos, index })
  const closeLightbox = () => setLightbox(null)

  /** 앞뒤로 한 장 이동합니다. 끝에 닿으면 반대쪽 끝으로 돌아갑니다. */
  const stepLightbox = useCallback((direction: number) => {
    setLightbox((current) => {
      if (!current || current.photos.length < 2) return current
      const count = current.photos.length
      return { ...current, index: (current.index + direction + count) % count }
    })
  }, [])

  // 확대 보기가 열려 있는 동안 Esc 로 닫고, 좌우 방향키로 사진을 넘깁니다.
  useEffect(() => {
    if (!lightbox) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeLightbox()
        return
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault()
        stepLightbox(event.key === 'ArrowRight' ? 1 : -1)
      }
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [lightbox, stepLightbox])

  const meta = [
    { icon: 'calendar_month', label: '시상일', value: ceremonyDate ?? '일정 추후 안내' },
    { icon: 'location_on', label: '장소', value: ceremony.location },
    { icon: 'groups', label: '주최', value: ceremony.hostedBy },
    { icon: 'handshake', label: '후원', value: ceremony.sponsoredBy },
  ].filter((row) => Boolean(row.value))

  // 확대 보기에 지금 떠 있는 사진과, 넘길 사진이 더 있는지 여부.
  const currentPhoto = lightbox ? lightbox.photos[lightbox.index] : null
  const hasMultiplePhotos = (lightbox?.photos.length ?? 0) > 1

  return (
    <div className={styles.wrapper}>
      <div className={styles.topBar}>
        <Link to={paths.winners} className={styles.backButton}>
          <Icon name="arrow_back" />
          목록으로 돌아가기
        </Link>

        <nav className={styles.breadcrumb} aria-label="현재 위치">
          <Link to={paths.home} className={styles.breadcrumbLink}>
            홈
          </Link>
          <Icon name="chevron_right" className={styles.breadcrumbSep} />
          <Link to={paths.winners} className={styles.breadcrumbLink}>
            우리말 수상자
          </Link>
          <Icon name="chevron_right" className={styles.breadcrumbSep} />
          <span className={styles.breadcrumbCurrent}>{ceremony.title}</span>
        </nav>
      </div>

      <div className={styles.head}>
        <div>
          <h1 className={styles.headTitle}>{ceremony.title}</h1>
          {ceremony.description.length > 0 && (
            <p className={styles.headDescription}>
              {ceremony.description.map((line, index) => (
                <span key={line}>
                  {line}
                  {index < ceremony.description.length - 1 && <br />}
                </span>
              ))}
            </p>
          )}

          <dl className={styles.metaList}>
            {meta.map((row) => (
              <div key={row.label} className={styles.metaRow}>
                <Icon name={row.icon} className={styles.metaIcon} />
                <dt className={styles.metaLabel}>{row.label}</dt>
                <dd className={styles.metaValue}>{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <SafeImage
          className={styles.headPhoto}
          src={ceremony.representativePicture}
          alt={`${ceremony.title} 대표 사진`}
          sizes="(min-width: 900px) 760px, 92vw"
          eager
        />
      </div>

      {ceremony.sections.map((section: AwardSection) => (
        <section
          key={section.section}
          className={styles.section}
          style={{ '--section-color': section.color } as CSSProperties}
        >
          <div className={styles.sectionHead}>
            <div className={styles.sectionTitleGroup}>
              <Icon
                name={SECTION_ICONS[section.section] ?? 'workspace_premium'}
                className={styles.sectionIcon}
                filled
              />
              <h2 className={styles.sectionTitle}>{section.section} 부문</h2>
              <span className={styles.sectionDot} />
            </div>
            {section.description && (
              <p className={styles.sectionDescription}>{section.description}</p>
            )}
          </div>

          {section.winners.length === 0 ? (
            <p className={styles.winnerEmpty}>수상자 발표 예정입니다.</p>
          ) : (
            <div className={styles.winnerGrid}>
              {section.winners.map((winner, winnerIndex) => (
                <article key={`${winner.name}-${winner.affiliation}`} className={styles.winnerCard}>
                  <button
                    type="button"
                    className={styles.winnerPhotoButton}
                    aria-label={`${winner.name} ${section.section} 수상 사진 확대 보기`}
                    onClick={() =>
                      openLightbox(
                        section.winners.map((item) => ({
                          src: item.imageUrl,
                          alt: `${item.name} ${section.section} 수상 사진`,
                        })),
                        winnerIndex,
                      )
                    }
                  >
                    <SafeImage
                      className={styles.winnerPhoto}
                      imageClassName={styles.winnerPhotoImage}
                      src={winner.imageUrl}
                      alt={`${winner.name} ${section.section} 수상 사진`}
                      fallbackText={`${winner.name} ${section.section}`}
                      sizes="(min-width: 768px) 220px, 45vw"
                    />
                    <span className={styles.zoomOverlay}>
                      <Icon name="zoom_in" className={styles.zoomIcon} />
                    </span>
                  </button>
                  <div className={styles.winnerBody}>
                    <h3 className={styles.winnerName}>
                      {winner.name.replace("(공동수상)", "")} {(winner.name.includes("(공동수상)")) ? `${section.section}(공동수상)` : section.section}
                    </h3>
                    <p className={styles.winnerAffiliation}>{winner.affiliation}</p>
                    {winner.representativeLink && (
                      <a
                        className={styles.winnerLink}
                        href={winner.representativeLink}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        주요 사례 보기
                        <Icon name="arrow_forward" className={styles.winnerLinkIcon} />
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ))}

      {ceremony.ceremonyPictures.length > 0 && (
        <section className={styles.gallery}>
          <div className={styles.galleryHead}>
            <span className={styles.galleryIcon}>
              <Icon name="photo_camera" />
            </span>
            <h2 className={styles.galleryTitle}>{ceremony.month}월 시상식 현장</h2>
          </div>
          <div className={styles.galleryGrid}>
            {ceremony.ceremonyPictures.map((picture, index) => (
              <button
                key={picture.picture}
                type="button"
                className={styles.galleryItem}
                onClick={() =>
                  openLightbox(
                    ceremony.ceremonyPictures.map((item, itemIndex) => ({
                      src: item.picture,
                      alt: `${ceremony.month}월 시상식 현장 사진 ${itemIndex + 1}`,
                    })),
                    index,
                  )
                }
                aria-label={`${ceremony.month}월 시상식 현장 사진 ${index + 1} 확대 보기`}
              >
                <SafeImage
                  className={styles.galleryThumb}
                  src={picture.thumbnail}
                  alt={`${ceremony.month}월 시상식 현장 사진 ${index + 1}`}
                  sizes="(min-width: 768px) 260px, 45vw"
                />
              </button>
            ))}
          </div>
        </section>
      )}
      <div className={styles.aboutCard}>
        <div className={styles.aboutHead}>
          <Icon name="emoji_events" className={styles.aboutIcon} filled />
          <h3 className={styles.aboutTitle}>쉽고 바른 우리말 언론인상이란?</h3>
        </div>
        <p className={styles.aboutBody}>
          신문과 방송 등에서 쉽고 바른 우리말을 적극 사용하여 국민의 알권리를 보호하고,
           우리말의 가치와 품격을 높인 언론인을 발굴하고 격려하기 위해 제정되었습니다.
        </p>
        <Link to={paths.introduction} className={styles.aboutLink}>
          상 소개 더 보기
          <Icon name="arrow_forward" className={styles.winnerLinkIcon} />
        </Link>
      </div>
      {/* 앞뒤 회차가 있으면 링크, 없으면 누를 수 없는 단추로 둡니다. */}
      <div className={styles.pager}>
        {previous ? (
          <Link to={paths.ceremony(previous.id)} className={styles.pagerButton}>
            <Icon name="chevron_left" className={styles.pagerIcon} />
            <span>
              <span className={styles.pagerLabel}>이전 글</span>
              <span className={styles.pagerTitle}>{previous.title}</span>
            </span>
          </Link>
        ) : (
          <button type="button" className={styles.pagerButton} disabled>
            <Icon name="chevron_left" className={styles.pagerIcon} />
            <span>
              <span className={styles.pagerLabel}>이전 글</span>
              <span className={styles.pagerTitle}>이전 회차 없음</span>
            </span>
          </button>
        )}

        <Link to={paths.winners} className={styles.pagerCenter}>
          <Icon name="format_list_bulleted" />
          목록으로 돌아가기
        </Link>

        {next ? (
          <Link to={paths.ceremony(next.id)} className={styles.pagerNext}>
            <span>
              <span className={styles.pagerLabel}>다음 글</span>
              <span className={styles.pagerTitle}>{next.title}</span>
            </span>
            <Icon name="chevron_right" className={styles.pagerIcon} />
          </Link>
        ) : (
          <button type="button" className={styles.pagerNext} disabled>
            <span>
              <span className={styles.pagerLabel}>다음 글</span>
              <span className={styles.pagerTitle}>다음 회차 없음</span>
            </span>
            <Icon name="chevron_right" className={styles.pagerIcon} />
          </button>
        )}
      </div>

      {lightbox && currentPhoto && (
        <div
          className={styles.lightbox}
          role="dialog"
          aria-modal="true"
          aria-label="시상식 사진 확대 보기"
          onClick={closeLightbox}
        >
          <button type="button" className={styles.lightboxClose} aria-label="닫기">
            <Icon name="close" />
          </button>

          {/* 사진 영역 안쪽 클릭은 닫기로 이어지지 않게 막습니다. */}
          <div className={styles.lightboxViewer} onClick={(event) => event.stopPropagation()}>
            {/* 사진을 누르면 다음 장으로 넘어갑니다. */}
            <button
              type="button"
              className={styles.lightboxPhotoButton}
              disabled={!hasMultiplePhotos}
              aria-label={
                hasMultiplePhotos ? '사진 클릭: 다음 사진' : currentPhoto.alt
              }
              onClick={() => stepLightbox(1)}
            >
              {/* 확대 보기에서만 원본 화질을 불러옵니다. */}
              <ThumbnailedImageCard
                key={currentPhoto.src}
                rawImagePath={currentPhoto.src}
                altImagePath={currentPhoto.alt}
                className={styles.lightboxImage}
                imageClassName={styles.lightboxImageInner}
                fullResolution
                eager
              />
            </button>

            {hasMultiplePhotos && (
              <div className={styles.lightboxControls}>
                <button
                  type="button"
                  className={styles.lightboxNavButton}
                  onClick={() => stepLightbox(-1)}
                >
                  <Icon name="chevron_left" />
                  이전 사진
                </button>
                <span className={styles.lightboxCounter} aria-live="polite">
                  {lightbox.index + 1} / {lightbox.photos.length}
                </span>
                <button
                  type="button"
                  className={styles.lightboxNavButton}
                  onClick={() => stepLightbox(1)}
                >
                  다음 사진
                  <Icon name="chevron_right" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default AwardCeremonyDetail
