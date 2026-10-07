import AwardSummaryCard from '../components/AwardSummaryCard'
import NominateYourCandidatePopup from '../components/NominateYourCandidatePopup'
import Icon from '../components/Icon'
import NominationCta from '../components/NominationCta'
import Reveal from '../components/Reveal'
import { Link } from 'react-router'
import { paths } from '../navigation'
import { HOMESCREEN_CONFIG, HOMESCREEN_DEFAULT, parseHomescreen } from '../data/homescreen'
import { useThumbnail } from '../hooks/useThumbnail'
import { AWARDS_CONFIG } from '../data/awards'
import { formatCeremonyShort, parseAwardSchedule, scheduleRows } from '../data/schedules'
import { useConfig } from '../hooks/useConfig'
import styles from './HomePage.module.css'
import AwardEventNoticePopup from '../components/AwardEventNoticePopup'
import PopupLayer from '../components/PopupLayer'
import { usePopups } from '../hooks/usePopups'

/** 홈에서 띄우는 팝업들. 배열 순서대로 레이어에 나란히 놓입니다. */
const POPUP_NOMINATE = 'nominateYourCandidate'
const POPUP_EVENT_NOTICE = 'awardEventNotice'
const POPUP_IDS = [POPUP_NOMINATE, POPUP_EVENT_NOTICE]

const CRITERIA = [
  {
    icon: 'translate',
    title: '어려운 표현을 쉬운 우리말로 바꿔 쓴 언론인',
    body: '외국어나 어려운 용어 대신 알기 쉬운 우리말을 적극적으로 사용한 사람',
  },
  {
    icon: 'groups',
    title: '누구나 이해하기 쉽게 전달한 언론인',
    body: '어려운 내용을 독자·시청자·청취자의 눈높이에 맞게 풀어 설명한 사람',
  },
  {
    icon: 'verified',
    title: '우리말 사용의 모범을 보여준 언론인',
    body: '기사·진행·대사·해설·자막에서 정확하고 자연스러운 우리말을 일관되게 사용한 사람',
  },
]

/**
 * 일정 카드 아이콘. 일정 내용은 시상식 설정에 있고, 아이콘은 화면 모양이라 여기 둡니다.
 * (같은 일정을 시상식 안내에서는 다른 아이콘으로 보여 줍니다)
 */
/** 포스터가 차지하는 폭. 컨테이너 최대 폭(--container-max)까지 넓어집니다. */
const POSTER_SIZES = '(min-width: 1280px) 1280px, 100vw'

const SCHEDULE_ICONS: Record<string, string> = {
  monthly: 'calendar_month',
  annual: 'emoji_events',
}

/** 원본 index.html */
function HomePage() {
  const popups = usePopups(POPUP_IDS)
  const homescreen = useConfig(HOMESCREEN_CONFIG, parseHomescreen)
  /*
   * 홈 화면은 받아 오지 못해도 빈 칸을 남기지 않습니다.
   *
   * 포스터가 비면 첫 화면 가운데가 텅 비고, 이메일이 비면 문의 문구가 이상해집니다. 그래서 이
   * 설정만 오류를 화면에 띄우지 않고 기본값으로 대신합니다 (원인은 콘솔에 남습니다).
   */
  const home = homescreen.data ?? HOMESCREEN_DEFAULT
  /*
   * 포스터는 첫 화면 맨 위에서 바로 보이므로 크기가 그대로 체감됩니다.
   *
   * 기본 포스터는 7759px 짜리 원본이라, 빌드 때 만들어 둔 _md(1440px) 를 후보로 함께 넘겨
   * 브라우저가 화면 폭에 맞는 쪽을 고르게 합니다. 관리 화면에서 고른 포스터는 백엔드가 만든
   * 축소본이 후보로 들어갑니다 (useThumbnail 이 두 경우를 모두 다룹니다).
   */
  const poster = useThumbnail(home.mainBannerImage)
  // 일정은 시상식 설정에서 만듭니다 (수상자 화면과 같은 설정, 같은 캐시).
  const schedules = useConfig(AWARDS_CONFIG, parseAwardSchedule)

  return (
    <>
      {/* 팝업은 한 장의 레이어 위에 나란히 놓이고, 각각 따로 닫을 수 있습니다. */}
      <PopupLayer open={popups.anyOpen} onDismiss={popups.closeAll}>
        {popups.isOpen(POPUP_NOMINATE) && (
          <NominateYourCandidatePopup
            onClose={() => popups.close(POPUP_NOMINATE)}
            onHideToday={() => popups.hideToday(POPUP_NOMINATE)}
          />
        )}
        {popups.isOpen(POPUP_EVENT_NOTICE) && (
          <AwardEventNoticePopup
            onClose={() => popups.close(POPUP_EVENT_NOTICE)}
            onHideToday={() => popups.hideToday(POPUP_EVENT_NOTICE)}
          />
        )}
      </PopupLayer>

      <main>
        <section className={styles.hero}>
          <div className={`${styles.posterWrap} ${styles.fadeDelay1}`}>
            <picture>
              {poster?.webpSrcSet && (
                <source type="image/webp" srcSet={poster.webpSrcSet} sizes={POSTER_SIZES} />
              )}
              <img
                className={styles.poster}
                src={poster?.src ?? home.mainBannerImage}
                srcSet={poster?.srcSet || undefined}
                sizes={poster?.srcSet ? POSTER_SIZES : undefined}
                alt={home.mainBannerAltText}
              />
            </picture>
          </div>
          <div className={`${styles.heroActions} ${styles.fadeDelay2}`}>
            <Link to={paths.introduction} className={styles.heroGold}>
              시상식 안내
            </Link>
            <Link to={paths.nomination} className={styles.heroOutline}>
              언론인 추천
            </Link>
          </div>
        </section>

        <section className={styles.about} id="about">
          <h2 className={styles.sectionHeading}>어떤 언론인을 찾나요?</h2>

          <div className={styles.aboutGrid}>
            {CRITERIA.map((item) => (
              <div key={item.icon} className={styles.aboutCard}>
                <Icon name={item.icon} className={styles.aboutIcon} />
                <h3 className={styles.aboutTitle}>{item.title}</h3>
                <p className={styles.aboutBody}>{item.body}</p>
              </div>
            ))}
          </div>

          <div className={styles.glossaryBanner}>
            <p className={styles.glossaryText}>
              <Link to={paths.glossary} className={styles.glossaryLink}>
                '우리말 개선 용어'
              </Link>
              를 우선적으로 사용한 언론인을 추천 및 발굴합니다.
              <br className={styles.glossaryBreak} />
              <span className={styles.glossaryNote}>
                국어문화원연합회가 다듬은 쉬운 우리말 대체어 목록을 기준으로 삼습니다.
              </span>
            </p>
            <Link to={paths.glossary} className={styles.glossaryButton}>
              우리말 개선 용어 보기
            </Link>
          </div>
        </section>

        <section className={styles.schedule}>
          <div className={styles.scheduleInner}>
            <h2 className={styles.sectionHeading}>시상식 주요 일정</h2>

            {schedules.error && <p className={styles.scheduleError}>{schedules.error}</p>}

            <div className={styles.scheduleGrid}>
              {schedules.data?.awards.map((award) => (
                <Reveal key={award.id} className={styles.scheduleItem}>
                  <div className={styles.scheduleBadge}>
                    <Icon name={SCHEDULE_ICONS[award.id] ?? 'event'} />
                  </div>
                  <div className={styles.scheduleCard}>
                    <p className={styles.scheduleYear}>{schedules.data?.year}년</p>
                    <h4 className={styles.scheduleTitle}>{award.title}</h4>
                    <ul className={styles.scheduleList}>
                      {scheduleRows(award).map((row) => (
                        <li key={row.key} className={styles.scheduleRow}>
                          <span className={styles.scheduleMonth}>{row.month}</span>
                          <span className={styles.scheduleWhen}>{formatCeremonyShort(row.ceremony)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              ))}
            </div>

            <AwardSummaryCard />
          </div>
        </section>

        <NominationCta
          title="우리말의 품격을 높인 언론인을 추천해주세요"
          body={
            <>
              우리말 개선 용어를 적극적으로 사용한 언론인을 추천해 주세요.
              <br />
              외국어나 어려운 표현 대신 쉬운 우리말을 사용한 기사와 방송을 추천해 주세요.
            </>
          }
          buttonLabel="추천하기"
        />

        <section className={styles.contact}>
          <div className={styles.contactInner}>
            <div>
              <h4 className={styles.contactTitle}>문의 사항이 있으신가요?</h4>
              <p className={styles.contactNote}>
                시상식 사무국 이메일: {home.contactEmailAddr} (평일 {home.businessHours})
              </p>
            </div>
            <a
              className={styles.contactIcon}
              href={`mailto:${home.contactEmailAddr}`}
              title="이메일 문의"
            >
              <Icon name="mail" />
            </a>
          </div>
        </section>
      </main>
    </>
  )
}

export default HomePage
