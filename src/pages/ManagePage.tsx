import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon'
import ImagePicker from '../components/manage/ImagePicker'
import {
  parseAwardData,
  type RawAwardCeremony,
  type RawAwardConfig,
  type RawAwardSection,
  type RawWinner,
} from '../data/awards'
import {
  dateTimeInputToEpoch,
  epochToDateTimeInput,
  fetchAwardConfigForEditing,
  fetchHomescreenConfigForEditing,
  fetchSocialMediaConfigForEditing,
  formatFileSize,
  saveAwardConfig,
  saveHomescreenConfig,
  saveSocialMediaConfig,
  seoulYearMonth,
} from '../data/manage'
import { HOMESCREEN_DEFAULT, type RawHomescreenConfig } from '../data/homescreen'
import type { RawSocialMediaConfig } from '../data/socialMedia'
import { useAssetLibrary, type AssetLibrary } from '../hooks/useAssetLibrary'
import styles from './ManagePage.module.css'

/**
 * 관리 - a visual editor for the three site configs.
 *
 * Each config is a separate object in the bucket behind its own endpoint (home screen, award info,
 * social media posts), so each is loaded and saved on its own. They share one 저장 button: it posts
 * whichever of them was actually edited, which keeps the mental model to "change anything, save".
 *
 * Every section works with the stored object keys, not the CloudFront URLs the public endpoints
 * return, so that saving cannot turn keys into URLs; previews come from the asset list. The home
 * screen also reads the raw config so that "no banner chosen" is not saved back as a real choice.
 *
 * The award config keeps held and not-yet-held ceremonies in separate lists, so "시상식 완료" here does
 * not flip a flag in place - it moves the entry from one list to the other. The award of the year is
 * its own slot rather than whichever entry happens to fall in December.
 *
 * The route only exists when an admin is signed in and a backend is configured - see U44App.tsx.
 */

const EMPTY_CONFIG: RawAwardConfig = {
  awardCeremonies: [],
  awardCeremoniesPending: [],
  awardInfoConfigLastUpdated: 0,
}

const EMPTY_HOMESCREEN: RawHomescreenConfig = {
  mainBannerImage: '',
  mainBannerAltText: '',
  contactEmailAddr: '',
  businessHours: '',
  homescreenConfigLastUpdated: 0,
}

const EMPTY_SOCIAL: RawSocialMediaConfig = {
  socialMediaPosts: [],
  profileURL: '',
  handle: '',
  socialMediaPostsConfigLastUpdated: 0,
}

/** 어느 설정이 고쳐졌는지. 고쳐진 것만 저장합니다. */
interface DirtyFlags {
  award: boolean
  home: boolean
  social: boolean
}

const NOTHING_DIRTY: DirtyFlags = { award: false, home: false, social: false }

/** A ceremony that has not happened yet only needs these; the rest is filled in afterwards. */
function newCeremony(complete: boolean): RawAwardCeremony {
  const now = new Date()
  const { year, month } = seoulYearMonth(now.getTime())
  return {
    awardYear: year,
    awardMonth: month,
    isAwardCeremonyComplete: complete,
    awardCeremonyLocation: '',
    ...(complete && { awardCeremonyTime: now.getTime() }),
  }
}

function newSection(): RawAwardSection {
  return { section: '', description: '', sectionColor: '#003FD1', winners: [] }
}

function newWinner(): RawWinner {
  return { name: '', image: '', affiliation: '', representativeLink: '' }
}

function ManagePage() {
  const library = useAssetLibrary('image')
  const [draft, setDraft] = useState<RawAwardConfig | null>(null)
  const [home, setHome] = useState<RawHomescreenConfig | null>(null)
  const [social, setSocial] = useState<RawSocialMediaConfig | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState<DirtyFlags>(NOTHING_DIRTY)

  const anyDirty = dirty.award || dirty.home || dirty.social

  /** 세 설정을 한꺼번에 받아 옵니다. 하나가 실패해도 나머지는 고칠 수 있게 따로 다룹니다. */
  const load = async () => {
    const [award, homescreen, socialMedia] = await Promise.allSettled([
      fetchAwardConfigForEditing(),
      fetchHomescreenConfigForEditing(),
      fetchSocialMediaConfigForEditing(),
    ])
    if (award.status === 'fulfilled') setDraft({ ...EMPTY_CONFIG, ...award.value })
    if (homescreen.status === 'fulfilled') setHome({ ...EMPTY_HOMESCREEN, ...homescreen.value })
    if (socialMedia.status === 'fulfilled') setSocial({ ...EMPTY_SOCIAL, ...socialMedia.value })

    const failures = [award, homescreen, socialMedia]
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)))
    failures.forEach((message) => console.error(message))
    setLoadError(failures.length > 0 ? failures.join('\n') : null)
    setDirty(NOTHING_DIRTY)
  }

  // 첫 설정만 여기서 받아 옵니다. 화면을 떠난 뒤 응답이 와도 상태를 건드리지 않도록 막습니다.
  useEffect(() => {
    let active = true
    Promise.allSettled([
      fetchAwardConfigForEditing(),
      fetchHomescreenConfigForEditing(),
      fetchSocialMediaConfigForEditing(),
    ]).then(([award, homescreen, socialMedia]) => {
      if (!active) return
      if (award.status === 'fulfilled') setDraft({ ...EMPTY_CONFIG, ...award.value })
      if (homescreen.status === 'fulfilled') setHome({ ...EMPTY_HOMESCREEN, ...homescreen.value })
      if (socialMedia.status === 'fulfilled') setSocial({ ...EMPTY_SOCIAL, ...socialMedia.value })

      const failures = [award, homescreen, socialMedia]
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)))
      failures.forEach((message) => console.error(message))
      setLoadError(failures.length > 0 ? failures.join('\n') : null)
    })

    return () => {
      active = false
    }
  }, [])

  // Leaving with unsaved edits loses them, so the browser asks first.
  useEffect(() => {
    if (!anyDirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [anyDirty])

  const patch = (changes: Partial<RawAwardConfig>) => {
    setDirty((current) => ({ ...current, award: true }))
    setDraft((current) => (current ? { ...current, ...changes } : current))
  }

  const patchHome = (changes: Partial<RawHomescreenConfig>) => {
    setDirty((current) => ({ ...current, home: true }))
    setHome((current) => (current ? { ...current, ...changes } : current))
  }

  const patchSocial = (changes: Partial<RawSocialMediaConfig>) => {
    setDirty((current) => ({ ...current, social: true }))
    setSocial((current) => (current ? { ...current, ...changes } : current))
  }

  const held = draft?.awardCeremonies ?? []
  const pending = draft?.awardCeremoniesPending ?? []

  const replaceIn = (list: RawAwardCeremony[], index: number, changes: Partial<RawAwardCeremony>) =>
    list.map((entry, i) => (i === index ? { ...entry, ...changes } : entry))

  /**
   * "시상식 완료" 를 켜고 끄면 목록 사이를 옮깁니다.
   *
   * 설정이 끝난 시상식과 예정된 시상식을 따로 담으므로, 플래그만 바꾸면 잘못된 목록에 남아
   * 저장할 때 막힙니다. 옮기면서 플래그도 같이 맞춥니다.
   */
  const moveCeremony = (from: 'held' | 'pending', index: number) => {
    const source = from === 'held' ? held : pending
    const moving = source[index]
    if (!moving) return
    const complete = from === 'pending'
    /*
     * 시상 시각은 건드리지 않습니다.
     *
     * 끝난 시상식에는 시각이 반드시 있어야 하지만, 비어 있을 때 '지금'으로 채우면 사이트에 없던
     * 날짜가 실제 시상 일시인 것처럼 올라갑니다. 비워 둔 채로 두고 저장할 때 알려 주는 편이 낫습니다.
     */
    const moved: RawAwardCeremony = { ...moving, isAwardCeremonyComplete: complete }
    const rest = source.filter((_, i) => i !== index)
    patch(
      from === 'held'
        ? { awardCeremonies: rest, awardCeremoniesPending: [...pending, moved] }
        : { awardCeremoniesPending: rest, awardCeremonies: [...held, moved] },
    )
  }

  /**
   * 고쳐진 설정만 저장합니다.
   *
   * 셋은 서로 다른 객체·다른 엔드포인트라 한 번에 보낼 수 없습니다. 하나가 실패해도 나머지는
   * 저장하고, 실패한 것만 고쳐졌다고 남겨 둡니다 — 그래야 다시 누르면 실패한 것만 다시 보냅니다.
   */
  const save = async () => {
    setSaving(true)
    setSaveError(null)

    const problems: string[] = []
    const stillDirty: DirtyFlags = { ...dirty }

    if (dirty.award && draft) {
      try {
        // Validate with the very code the site uses to read this config, so a save cannot produce
        // something the pages would then refuse to display.
        parseAwardData(draft)
        await saveAwardConfig(draft)
        stillDirty.award = false
      } catch (err) {
        console.error(err)
        problems.push(err instanceof Error ? err.message : '시상식 설정을 저장하지 못했습니다.')
      }
    }

    if (dirty.home && home) {
      try {
        await saveHomescreenConfig(home)
        stillDirty.home = false
      } catch (err) {
        console.error(err)
        problems.push(err instanceof Error ? err.message : '홈 화면 설정을 저장하지 못했습니다.')
      }
    }

    if (dirty.social && social) {
      try {
        const emptyAt = social.socialMediaPosts.findIndex((post) => !post.image || !post.href)
        if (emptyAt !== -1) {
          throw new Error(`누리소통망 글 ${emptyAt + 1}번: 사진과 글 주소를 모두 채워 주세요.`)
        }
        await saveSocialMediaConfig(social)
        stillDirty.social = false
      } catch (err) {
        console.error(err)
        problems.push(err instanceof Error ? err.message : '누리소통망 설정을 저장하지 못했습니다.')
      }
    }

    setDirty(stillDirty)
    setSaveError(problems.length > 0 ? problems.join('\n') : null)
    if (problems.length === 0) setSavedAt(new Date().toLocaleTimeString('ko-KR'))
    setSaving(false)
  }

  return (
    <main className={styles.main}>
      <header className={styles.topBar}>
        <div>
          <h1 className={styles.title}>관리</h1>
          <p className={styles.subtitle}>
            홈 화면, 시상식 정보, 누리소통망, 이미지를 고칩니다. 저장해야 사이트에 반영됩니다.
          </p>
        </div>
        <div className={styles.topActions}>
          {/* 어느 칸을 고쳤는지 알려 줍니다. 저장은 고친 것만 보냅니다. */}
          {anyDirty && (
            <span className={styles.dirtyMark}>
              저장하지 않은 변경:{' '}
              {[dirty.home && '홈 화면', dirty.award && '시상식', dirty.social && '누리소통망']
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
          {savedAt && !anyDirty && <span className={styles.savedMark}>{savedAt}에 저장됨</span>}
          <button type="button" className={styles.secondaryButton} onClick={() => void load()} disabled={saving}>
            되돌리기
          </button>
          <button type="button" className={styles.primaryButton} onClick={() => void save()} disabled={saving || !anyDirty}>
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </header>

      {loadError && <p className={styles.error}>{loadError}</p>}
      {saveError && <p className={styles.error}>{saveError}</p>}
      {!draft && !home && !social && !loadError && (
        <p className={styles.status}>설정을 불러오는 중입니다…</p>
      )}

      {home && <HomescreenEditor config={home} library={library} onChange={patchHome} />}
      {social && <SocialMediaEditor config={social} library={library} onChange={patchSocial} />}

      {draft && (
        <>
          {/* 올해의 언론인상 */}
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>올해의 언론인상</h2>
              {draft.awardCeremonyOfTheYear ? (
                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={() => patch({ awardCeremonyOfTheYear: undefined })}
                >
                  <Icon name="delete" /> 올해의 시상식 비우기
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => patch({ awardCeremonyOfTheYear: newCeremony(false) })}
                >
                  <Icon name="add" /> 올해의 시상식 정하기
                </button>
              )}
            </div>
            <p className={styles.hint}>
              12월이라는 규칙 대신 이 자리로 정합니다. 비워 두면 일정표에 ‘올해의 시상식 · 일정 추후 안내’로
              나옵니다.
            </p>

            {draft.awardCeremonyOfTheYear ? (
              <div className={styles.ceremonyList}>
                <CeremonyEditor
                  ceremony={draft.awardCeremonyOfTheYear}
                  library={library}
                  heading={`${draft.awardCeremonyOfTheYear.awardYear}년 올해의 언론인상`}
                  onChange={(changes) =>
                    patch({
                      awardCeremonyOfTheYear: { ...draft.awardCeremonyOfTheYear!, ...changes },
                    })
                  }
                  // 옮겨 갈 목록이 없는 자리이므로, 여기서는 플래그를 그대로 바꿉니다.
                  onToggleComplete={() =>
                    patch({
                      awardCeremonyOfTheYear: {
                        ...draft.awardCeremonyOfTheYear!,
                        isAwardCeremonyComplete: !draft.awardCeremonyOfTheYear!.isAwardCeremonyComplete,
                      },
                    })
                  }
                />
              </div>
            ) : (
              <p className={styles.status}>올해의 시상식이 정해지지 않았습니다.</p>
            )}
          </section>

          {/* 끝난 시상식 */}
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>끝난 시상식 ({held.length})</h2>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => patch({ awardCeremonies: [...held, newCeremony(true)] })}
              >
                <Icon name="add" /> 시상식 추가
              </button>
            </div>
            <p className={styles.hint}>수상자와 현장 사진을 담습니다. 일정표와 우리말 수상자 화면에 모두 나옵니다.</p>

            {held.length === 0 && <p className={styles.status}>끝난 시상식이 없습니다.</p>}
            <div className={styles.ceremonyList}>
              {held.map((ceremony, index) => (
                <CeremonyEditor
                  key={`held-${index}`}
                  ceremony={ceremony}
                  library={library}
                  heading={`${ceremony.awardYear}년 ${ceremony.awardMonth}월`}
                  onChange={(changes) => patch({ awardCeremonies: replaceIn(held, index, changes) })}
                  onRemove={() => patch({ awardCeremonies: held.filter((_, i) => i !== index) })}
                  onToggleComplete={() => moveCeremony('held', index)}
                />
              ))}
            </div>
          </section>

          {/* 예정된 시상식 */}
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>예정된 시상식 ({pending.length})</h2>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => patch({ awardCeremoniesPending: [...pending, newCeremony(false)] })}
              >
                <Icon name="add" /> 시상식 추가
              </button>
            </div>
            <p className={styles.hint}>
              일정표에만 나옵니다. 날짜를 비워 두면 ‘일정 추후 안내’로 표시됩니다.
            </p>

            {pending.length === 0 && <p className={styles.status}>예정된 시상식이 없습니다.</p>}
            <div className={styles.ceremonyList}>
              {pending.map((ceremony, index) => (
                <CeremonyEditor
                  key={`pending-${index}`}
                  ceremony={ceremony}
                  library={library}
                  heading={`${ceremony.awardYear}년 ${ceremony.awardMonth}월`}
                  onChange={(changes) => patch({ awardCeremoniesPending: replaceIn(pending, index, changes) })}
                  onRemove={() => patch({ awardCeremoniesPending: pending.filter((_, i) => i !== index) })}
                  onToggleComplete={() => moveCeremony('pending', index)}
                />
              ))}
            </div>
          </section>
        </>
      )}

      <AssetLibrarySection library={library} />
    </main>
  )
}

/* -------------------------------------------------------------------------- */
/* 홈 화면                                                                     */
/* -------------------------------------------------------------------------- */

function HomescreenEditor({
  config,
  library,
  onChange,
}: {
  config: RawHomescreenConfig
  library: AssetLibrary
  onChange: (changes: Partial<RawHomescreenConfig>) => void
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>홈 화면</h2>
      </div>
      <p className={styles.hint}>
        첫 화면의 대표 포스터와, 아래쪽 문의 문구에 들어가는 연락처입니다.
      </p>

      <div className={styles.ceremony}>
        <div className={styles.ceremonyBody}>
          <div className={styles.pictureRow}>
            <Field label="대표 포스터">
              <ImageField
                library={library}
                imageKey={config.mainBannerImage}
                onChange={(imageKey) => onChange({ mainBannerImage: imageKey })}
                title="대표 포스터 고르기"
              />
            </Field>
            <div className={styles.fieldGrid}>
              <Field label="포스터 대체 텍스트">
                <input
                  type="text"
                  className={styles.input}
                  placeholder={HOMESCREEN_DEFAULT.mainBannerAltText}
                  value={config.mainBannerAltText}
                  onChange={(e) => onChange({ mainBannerAltText: e.target.value })}
                />
                <p className={styles.hint}>
                  포스터를 볼 수 없는 분에게 읽어 주는 문구입니다. 포스터를 바꾸면 함께 고쳐 주세요.
                </p>
              </Field>
            </div>
          </div>
          {/*
            비워 두면 사이트와 함께 배포된 기본 포스터(default-main.png)가 나옵니다.
            그래야 아직 아무것도 올리지 않았을 때도 첫 화면이 비지 않습니다.
          */}
          {!config.mainBannerImage && (
            <p className={styles.hint}>
              고른 포스터가 없어 기본 포스터가 나옵니다 (default-main.png).
            </p>
          )}

          <div className={styles.fieldGrid}>
            <Field label="시상식 사무국 이메일">
              <input
                type="email"
                className={styles.input}
                placeholder={HOMESCREEN_DEFAULT.contactEmailAddr}
                value={config.contactEmailAddr}
                onChange={(e) => onChange({ contactEmailAddr: e.target.value })}
              />
            </Field>
            <Field label="문의 가능 시간">
              <input
                type="text"
                className={styles.input}
                placeholder={HOMESCREEN_DEFAULT.businessHours}
                value={config.businessHours}
                onChange={(e) => onChange({ businessHours: e.target.value })}
              />
            </Field>
          </div>
          {/* 문구가 어떻게 보이는지 그대로 미리 보여 줍니다. */}
          <p className={styles.hint}>
            첫 화면 문구: 시상식 사무국 이메일:{' '}
            {config.contactEmailAddr || HOMESCREEN_DEFAULT.contactEmailAddr} (평일{' '}
            {config.businessHours || HOMESCREEN_DEFAULT.businessHours})
          </p>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* 누리소통망                                                                   */
/* -------------------------------------------------------------------------- */

function SocialMediaEditor({
  config,
  library,
  onChange,
}: {
  config: RawSocialMediaConfig
  library: AssetLibrary
  onChange: (changes: Partial<RawSocialMediaConfig>) => void
}) {
  const posts = config.socialMediaPosts

  const replacePost = (index: number, changes: Partial<RawSocialMediaConfig['socialMediaPosts'][number]>) =>
    onChange({
      socialMediaPosts: posts.map((post, i) => (i === index ? { ...post, ...changes } : post)),
    })

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>누리소통망 ({posts.length})</h2>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => onChange({ socialMediaPosts: [...posts, { image: '', href: '', altText: '' }] })}
        >
          <Icon name="add" /> 글 추가
        </button>
      </div>
      <p className={styles.hint}>
        우리말 수상자 화면 아래쪽에 나옵니다. 글이 하나도 없으면 그 칸을 아예 그리지 않습니다.
      </p>

      <div className={styles.ceremony}>
        <div className={styles.ceremonyBody}>
          <div className={styles.fieldGrid}>
            <Field label="계정 주소">
              <input
                type="url"
                className={styles.input}
                placeholder="https://www.instagram.com/urimal_award/"
                value={config.profileURL}
                onChange={(e) => onChange({ profileURL: e.target.value })}
              />
              <p className={styles.hint}>‘더 보기’ 단추와 계정 이름 링크가 이 주소로 갑니다.</p>
            </Field>
            <Field label="계정 이름">
              <input
                type="text"
                className={styles.input}
                placeholder="@urimal_award"
                value={config.handle}
                onChange={(e) => onChange({ handle: e.target.value })}
              />
            </Field>
          </div>

          <div className={styles.winnerList}>
            {posts.map((post, index) => (
              <div key={index} className={styles.winnerRow}>
                <ImageField
                  library={library}
                  imageKey={post.image}
                  title="게시글 사진 고르기"
                  onChange={(imageKey) => replacePost(index, { image: imageKey })}
                />
                <div className={styles.winnerFields}>
                  <input
                    type="url"
                    className={styles.input}
                    placeholder="글 주소 (https://www.instagram.com/p/…)"
                    value={post.href}
                    onChange={(e) => replacePost(index, { href: e.target.value })}
                  />
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="대체 텍스트 (예: 인스타그램 게시글 3)"
                    value={post.altText}
                    onChange={(e) => replacePost(index, { altText: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={() => onChange({ socialMediaPosts: posts.filter((_, i) => i !== index) })}
                >
                  <Icon name="delete" />
                </button>
              </div>
            ))}
            {posts.length === 0 && <p className={styles.status}>등록된 글이 없습니다.</p>}
          </div>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* 시상식 한 건                                                                */
/* -------------------------------------------------------------------------- */

function CeremonyEditor({
  ceremony,
  library,
  heading,
  onChange,
  onRemove,
  onToggleComplete,
}: {
  ceremony: RawAwardCeremony
  library: AssetLibrary
  heading: string
  onChange: (changes: Partial<RawAwardCeremony>) => void
  onRemove?: () => void
  onToggleComplete: () => void
}) {
  const [open, setOpen] = useState(false)
  const complete = ceremony.isAwardCeremonyComplete

  /*
   * Changing the date also sets the year and month.
   * The config keeps them separately (a ceremony with no date yet still needs to say which month it
   * belongs to), and the API rejects a config where the two disagree - so they are kept in step
   * here rather than left for the editor to remember.
   */
  const onDateTimeChange = (value: string) => {
    const epochMs = dateTimeInputToEpoch(value)
    if (epochMs === undefined) {
      onChange({ awardCeremonyTime: undefined })
      return
    }
    const { year, month } = seoulYearMonth(epochMs)
    onChange({ awardCeremonyTime: epochMs, awardYear: year, awardMonth: month })
  }

  const sections = ceremony.awardWinners ?? []
  const pictures = ceremony.awardCeremonyPictures ?? []

  return (
    <article className={styles.ceremony}>
      <div className={styles.ceremonyHead}>
        <button type="button" className={styles.disclosure} aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon name={open ? 'expand_more' : 'chevron_right'} />
          <span className={styles.ceremonyTitle}>{heading}</span>
        </button>
        <label className={styles.completeToggle}>
          <input type="checkbox" checked={complete} onChange={onToggleComplete} />
          시상식 완료 (수상자 공개)
        </label>
        {onRemove && (
          <button type="button" className={styles.dangerButton} onClick={onRemove}>
            <Icon name="delete" /> 삭제
          </button>
        )}
      </div>

      {open && (
        <div className={styles.ceremonyBody}>
          <div className={styles.fieldGrid}>
            <Field label="시상 일시 (한국 시각)">
              <input
                type="datetime-local"
                className={styles.input}
                value={epochToDateTimeInput(ceremony.awardCeremonyTime)}
                onChange={(e) => onDateTimeChange(e.target.value)}
              />
              <p className={styles.hint}>
                {complete
                  ? '끝난 시상식은 일시가 있어야 합니다. 연·월은 날짜에 맞춰 자동으로 바뀝니다.'
                  : '비워 두면 ‘일정 추후 안내’로 표시됩니다. 연·월은 날짜에 맞춰 자동으로 바뀝니다.'}
              </p>
            </Field>
            <Field label="연도">
              <input
                type="number"
                className={styles.input}
                value={ceremony.awardYear}
                onChange={(e) => onChange({ awardYear: Number(e.target.value) })}
              />
            </Field>
            <Field label="월">
              <input
                type="number" min={1} max={12}
                className={styles.input}
                value={ceremony.awardMonth}
                onChange={(e) => onChange({ awardMonth: Number(e.target.value) })}
              />
            </Field>
            <Field label="장소">
              <input
                type="text"
                className={styles.input}
                value={ceremony.awardCeremonyLocation ?? ''}
                onChange={(e) => onChange({ awardCeremonyLocation: e.target.value })}
              />
            </Field>
          </div>

          {!complete && (
            <p className={styles.hint}>
              아직 열리지 않은 시상식입니다. 일정표에만 나오고, 우리말 수상자 화면에는 나오지 않습니다.
            </p>
          )}

          {complete && (
            <>
              <div className={styles.fieldGrid}>
                <Field label="주최">
                  <input
                    type="text" className={styles.input}
                    value={ceremony.awardHostedBy ?? ''}
                    onChange={(e) => onChange({ awardHostedBy: e.target.value })}
                  />
                </Field>
                <Field label="후원">
                  <input
                    type="text" className={styles.input}
                    value={ceremony.awardSponsoredBy ?? ''}
                    onChange={(e) => onChange({ awardSponsoredBy: e.target.value })}
                  />
                </Field>
              </div>

              <Field label="소개 문구 (한 줄에 하나씩)">
                <textarea
                  className={styles.textarea} rows={3}
                  value={(ceremony.description ?? []).join('\n')}
                  onChange={(e) => onChange({ description: e.target.value.split('\n') })}
                />
              </Field>

              <Field label="대표 사진">
                <ImageField
                  library={library}
                  imageKey={ceremony.awardRepresentativePicture ?? ''}
                  onChange={(imageKey) => onChange({ awardRepresentativePicture: imageKey })}
                  title="대표 사진 고르기"
                />
              </Field>

              {/* 부문과 수상자 */}
              <div className={styles.subSection}>
                <div className={styles.subHead}>
                  <h3 className={styles.subTitle}>부문</h3>
                  <button
                    type="button" className={styles.secondaryButton}
                    onClick={() => onChange({ awardWinners: [...sections, newSection()] })}
                  >
                    <Icon name="add" /> 부문 추가
                  </button>
                </div>
                {sections.map((section, sectionIndex) => (
                  <SectionEditor
                    key={sectionIndex}
                    section={section}
                    library={library}
                    onChange={(changes) =>
                      onChange({
                        awardWinners: sections.map((s, i) => (i === sectionIndex ? { ...s, ...changes } : s)),
                      })
                    }
                    onRemove={() =>
                      onChange({ awardWinners: sections.filter((_, i) => i !== sectionIndex) })
                    }
                  />
                ))}
              </div>

              {/* 시상식 현장 사진 */}
              <div className={styles.subSection}>
                <div className={styles.subHead}>
                  <h3 className={styles.subTitle}>시상식 현장 사진</h3>
                </div>
                <div className={styles.pictureRow}>
                  {pictures.map((picture, pictureIndex) => (
                    <div key={pictureIndex} className={styles.pictureItem}>
                      <ImageField
                        library={library}
                        imageKey={picture.picture}
                        title="현장 사진 고르기"
                        onChange={(imageKey) =>
                          onChange({
                            // The thumbnail is the same file under the thumbnail prefix, so both are
                            // set from one choice and cannot fall out of step.
                            awardCeremonyPictures: pictures.map((p, i) =>
                              i === pictureIndex
                                ? { picture: imageKey, thumbnail: library.findByKey(imageKey)?.assetThumbnailKey ?? '' }
                                : p,
                            ),
                          })
                        }
                      />
                      <button
                        type="button" className={styles.dangerButton}
                        onClick={() =>
                          onChange({ awardCeremonyPictures: pictures.filter((_, i) => i !== pictureIndex) })
                        }
                      >
                        <Icon name="delete" /> 빼기
                      </button>
                    </div>
                  ))}
                  <button
                    type="button" className={styles.secondaryButton}
                    onClick={() =>
                      onChange({ awardCeremonyPictures: [...pictures, { picture: '', thumbnail: '' }] })
                    }
                  >
                    <Icon name="add" /> 사진 추가
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </article>
  )
}

function SectionEditor({
  section,
  library,
  onChange,
  onRemove,
}: {
  section: RawAwardSection
  library: AssetLibrary
  onChange: (changes: Partial<RawAwardSection>) => void
  onRemove: () => void
}) {
  const winners = section.winners ?? []
  return (
    <div className={styles.sectionCard}>
      <div className={styles.fieldGrid}>
        <Field label="부문 이름">
          <input
            type="text" className={styles.input} placeholder="기자"
            value={section.section}
            onChange={(e) => onChange({ section: e.target.value })}
          />
        </Field>
        <Field label="부문 색">
          <input
            type="color" className={styles.colorInput}
            value={/^#[0-9a-f]{6}$/i.test(section.sectionColor) ? section.sectionColor : '#003FD1'}
            onChange={(e) => onChange({ sectionColor: e.target.value })}
          />
        </Field>
        <button type="button" className={styles.dangerButton} onClick={onRemove}>
          <Icon name="delete" /> 부문 삭제
        </button>
      </div>
      <Field label="부문 설명">
        <input
          type="text" className={styles.input}
          value={section.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </Field>

      <div className={styles.winnerList}>
        {winners.map((winner, winnerIndex) => (
          <div key={winnerIndex} className={styles.winnerRow}>
            <ImageField
              library={library}
              imageKey={winner.image}
              title="수상자 사진 고르기"
              onChange={(imageKey) =>
                onChange({ winners: winners.map((w, i) => (i === winnerIndex ? { ...w, image: imageKey } : w)) })
              }
            />
            <div className={styles.winnerFields}>
              <input
                type="text" className={styles.input} placeholder="이름"
                value={winner.name}
                onChange={(e) =>
                  onChange({ winners: winners.map((w, i) => (i === winnerIndex ? { ...w, name: e.target.value } : w)) })
                }
              />
              <input
                type="text" className={styles.input} placeholder="소속"
                value={winner.affiliation}
                onChange={(e) =>
                  onChange({ winners: winners.map((w, i) => (i === winnerIndex ? { ...w, affiliation: e.target.value } : w)) })
                }
              />
              <input
                type="url" className={styles.input} placeholder="대표 사례 주소 (없으면 단추를 숨깁니다)"
                value={winner.representativeLink ?? ''}
                onChange={(e) =>
                  onChange({ winners: winners.map((w, i) => (i === winnerIndex ? { ...w, representativeLink: e.target.value } : w)) })
                }
              />
            </div>
            <button
              type="button" className={styles.dangerButton}
              onClick={() => onChange({ winners: winners.filter((_, i) => i !== winnerIndex) })}
            >
              <Icon name="delete" />
            </button>
          </div>
        ))}
        <button
          type="button" className={styles.secondaryButton}
          onClick={() => onChange({ winners: [...winners, newWinner()] })}
        >
          <Icon name="add" /> 수상자 추가
        </button>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* 이미지 고르기 / 이미지 목록                                                 */
/* -------------------------------------------------------------------------- */

/** Shows the chosen image as a thumbnail and opens the picker. Stores the key, shows the picture. */
function ImageField({
  library,
  imageKey,
  onChange,
  title,
}: {
  library: AssetLibrary
  imageKey: string
  onChange: (imageKey: string) => void
  title: string
}) {
  const [picking, setPicking] = useState(false)
  const chosen = library.findByKey(imageKey)

  return (
    <div className={styles.imageField}>
      <button type="button" className={styles.imageButton} onClick={() => setPicking(true)} aria-label={title}>
        {chosen ? (
          <img className={styles.imagePreview} src={chosen.assetThumbnailURL} alt="" />
        ) : (
          <span className={styles.imageEmpty}>
            <Icon name="add_photo_alternate" />
            {imageKey ? '목록에 없는 이미지' : '이미지 고르기'}
          </span>
        )}
      </button>
      {imageKey && (
        <div className={styles.imageMeta}>
          <span className={styles.imageKey} title={imageKey}>{chosen?.assetName ?? imageKey}</span>
          <button type="button" className={styles.linkButton} onClick={() => onChange('')}>
            비우기
          </button>
        </div>
      )}
      {picking && (
        <ImagePicker
          library={library}
          selectedKey={imageKey}
          title={title}
          onSelect={onChange}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}

function AssetLibrarySection({ library }: { library: AssetLibrary }) {
  const fileInput = useRef<HTMLInputElement | null>(null)

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>이미지</h2>
        <div className={styles.topActions}>
          <button
            type="button" className={styles.secondaryButton}
            onClick={() => void library.refresh()} disabled={library.busy}
          >
            <Icon name="refresh" /> 새로 고침
          </button>
          <button
            type="button" className={styles.primaryButton}
            onClick={() => fileInput.current?.click()} disabled={library.busy}
          >
            <Icon name="upload" /> {library.busy ? '올리는 중…' : '이미지 올리기'}
          </button>
          <input
            ref={fileInput}
            type="file"
            className={styles.hiddenInput}
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              e.target.value = '' // 같은 파일을 다시 골라도 동작하도록 비웁니다.
              void library.upload(files)
            }}
          />
        </div>
      </div>
      <p className={styles.hint}>
        PNG · JPEG · WebP 를 올릴 수 있습니다. 올리면 목록용 축소본이 자동으로 만들어집니다.
        이름은 언제든 바꿀 수 있고, 이름을 바꿔도 시상식에 걸어 둔 사진은 그대로 남습니다.
      </p>

      {library.error && <p className={styles.error}>{library.error}</p>}
      {library.loading && <p className={styles.status}>이미지 목록을 불러오는 중입니다…</p>}
      {!library.loading && library.assets.length === 0 && <p className={styles.status}>올린 이미지가 없습니다.</p>}

      <div className={styles.imageGrid}>
        {library.assets.map((image) => (
          <figure key={image.assetKey} className={styles.imageCard}>
            <a href={image.assetURL} target="_blank" rel="noopener noreferrer">
              <img className={styles.imageCardThumb} src={image.assetThumbnailURL} alt={image.assetName} loading="lazy" />
            </a>
            <figcaption className={styles.imageCardBody}>
              <AssetName library={library} assetKey={image.assetKey} assetName={image.assetName} />
              <span className={styles.imageSize}>{formatFileSize(image.size)}</span>
              <button
                type="button" className={styles.dangerButton} disabled={library.busy}
                onClick={() => {
                  if (window.confirm('이 이미지를 지울까요? 설정에서 쓰고 있다면 그 자리가 비게 됩니다.')) {
                    void library.remove(image.assetKey)
                  }
                }}
              >
                <Icon name="delete" /> 삭제
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}

/** The name, editable in place. Renaming touches only the label, never the key. */
function AssetName({
  library,
  assetKey,
  assetName,
}: {
  library: AssetLibrary
  assetKey: string
  assetName: string
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(assetName)

  const commit = () => {
    setEditing(false)
    const next = value.trim()
    if (next === '' || next === assetName) {
      setValue(assetName) // 되돌립니다: 빈 이름은 받지 않습니다.
      return
    }
    void library.rename(assetKey, next)
  }

  if (!editing) {
    return (
      <button
        type="button"
        className={styles.nameButton}
        title={`${assetKey} — 눌러서 이름 바꾸기`}
        onClick={() => {
          setValue(assetName)
          setEditing(true)
        }}
      >
        {assetName}
      </button>
    )
  }

  return (
    <input
      type="text"
      className={styles.input}
      autoFocus
      value={value}
      disabled={library.busy}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') {
          setValue(assetName)
          setEditing(false)
        }
      }}
    />
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
    </label>
  )
}

export default ManagePage
