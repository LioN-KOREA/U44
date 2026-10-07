import { useEffect, useRef, useState, type FormEvent } from 'react'
import Icon from '../components/Icon'
import { Link } from 'react-router'
import { paths } from '../navigation'
import styles from './NominationPage.module.css'

/** Apps Script 로 배포한 웹앱 주소. 배포 URL 이 바뀌면 이 값만 교체하면 됩니다. */
const SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbzPGRfjUP4XQmnK3gmE68HduF2uyGlZKpFZIX8qSqOjHYMJKezYmzbZU6A-YhozpOJmhA/exec'

const MAX_WORKS = 5
const MAX_REASON = 1000
const TOTAL_STEPS = 4

const STEP_LABELS = ['추천인', '추천 대상', '제출 서류', '추천 사유']

const CATEGORIES = [
  { value: '기자', label: '기자 부문 (신문/통신)' },
  { value: 'PD', label: 'PD 부문 (방송/영상)' },
  { value: '아나운서', label: '아나운서 부문' },
]

interface Work {
  id: number
  title: string
  url: string
  date: string
  category: string
}

/** 오류가 표시된 필드 키 모음. 원본은 DOM 클래스로 관리하던 상태입니다. */
type ErrorSet = Record<string, boolean>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function emptyWork(id: number): Work {
  return { id, title: '', url: '', date: '', category: '' }
}

/** 원본 nomination.html — 4단계 추천서 작성 */
function NominationPage() {
  const [step, setStep] = useState(1)
  const [errors, setErrors] = useState<ErrorSet>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const formRef = useRef<HTMLFormElement | null>(null)
  const nextWorkId = useRef(2)

  const [recommender, setRecommender] = useState({ name: '', phone: '', email: '' })
  const [nominee, setNominee] = useState({ name: '', org: '', career: '' })
  const [works, setWorks] = useState<Work[]>([emptyWork(1)])
  const [reason, setReason] = useState('')
  const [consent, setConsent] = useState(false)

  // 접수 완료 화면이 떠 있는 동안에는 뒤쪽 문서가 스크롤되지 않게 합니다.
  useEffect(() => {
    if (!submitted) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [submitted])

  const setError = (next: ErrorSet) => setErrors(next)

  /** 현재 단계의 필수 항목을 검사하고, 오류 표시를 갱신합니다. */
  const validateStep = (target: number): boolean => {
    const found: ErrorSet = {}

    if (target === 1) {
      if (!recommender.name.trim()) found.recName = true
      if (!recommender.phone.trim()) found.recPhone = true
      if (!EMAIL_PATTERN.test(recommender.email.trim())) found.recEmail = true
    }
    if (target === 2) {
      if (!nominee.name.trim()) found.nomName = true
      if (!nominee.org.trim()) found.nomOrg = true
    }
    if (target === 3) {
      for (const work of works) {
        if (!work.title.trim()) found[`work-${work.id}-title`] = true
        if (!work.date.trim()) found[`work-${work.id}-date`] = true
        if (!work.category.trim()) found[`work-${work.id}-category`] = true
      }
    }

    setError(found)
    return Object.keys(found).length === 0
  }

  const goToStep = (target: number) => {
    setStep(target)
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleNext = () => {
    if (!validateStep(step)) return
    if (step < TOTAL_STEPS) goToStep(step + 1)
  }

  const handlePrev = () => {
    if (step > 1) goToStep(step - 1)
  }

  const addWork = () => {
    if (works.length >= MAX_WORKS) return
    setWorks((current) => [...current, emptyWork(nextWorkId.current++)])
  }

  const removeWork = (id: number) => {
    if (works.length <= 1) return
    setWorks((current) => current.filter((work) => work.id !== id))
  }

  const updateWork = (id: number, patch: Partial<Work>) => {
    setWorks((current) => current.map((work) => (work.id === id ? { ...work, ...patch } : work)))
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    const found: ErrorSet = {}
    if (!reason.trim()) found.reason = true
    if (!consent) found.consent = true
    setError(found)
    if (Object.keys(found).length > 0) return

    const payload = {
      submittedAt: new Date().toISOString(),
      recommender: {
        name: recommender.name.trim(),
        phone: recommender.phone.trim(),
        email: recommender.email.trim(),
      },
      nominee: {
        name: nominee.name.trim(),
        org: nominee.org.trim(),
        career: nominee.career.trim(),
      },
      works: works.map((work) => ({
        title: work.title.trim(),
        url: work.url.trim(),
        date: work.date,
        category: work.category,
      })),
      reason: reason.trim(),
    }

    setSubmitting(true)
    try {
      await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      })
    } catch {
      // Apps Script 응답은 CORS 때문에 읽을 수 없으므로 오류는 무시하고 진행합니다.
    } finally {
      setSubmitting(false)
      setSubmitted(true)
    }
  }

  const inputClass = (key: string) => (errors[key] ? styles.inputError : styles.input)

  return (
    <main className={styles.main}>
      <div className={styles.wrapper}>
        <div className={styles.intro}>
          <h1 className={styles.introTitle}>우수한 우리말 보도를 추천해주세요</h1>
          <p className={styles.introLead}>
            우리말의 품격을 높이고 올바른 언어 문화를 선도한 언론인과 자료를 기다립니다.
            <br className={styles.introBreak} />
            동료 언론인의 열정과 가치 있는 기록을 공정하게 추천해 주십시오.
          </p>
        </div>

        <form className={styles.form} ref={formRef} noValidate onSubmit={handleSubmit}>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressBar}
              style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
            />
          </div>

          <div className={styles.steps}>
            <div className={styles.stepsLine} />
            {STEP_LABELS.map((label, index) => {
              const number = index + 1
              const done = number < step
              const current = number === step
              return (
                <div key={label} className={styles.step}>
                  <span
                    className={
                      done
                        ? styles.stepCircleDone
                        : current
                          ? styles.stepCircleCurrent
                          : styles.stepCircle
                    }
                  >
                    {done ? <Icon name="check" className={styles.stepCheck} /> : number}
                  </span>
                  <span className={done || current ? styles.stepLabelActive : styles.stepLabel}>
                    {label}
                  </span>
                </div>
              )
            })}
          </div>

          {/* 1단계 — 추천인 정보 */}
          {step === 1 && (
            <div>
              <h3 className={styles.panelTitle}>추천인 정보</h3>
              <div className={styles.fieldGrid}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="rec-name">
                    성함 / 소속 <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="rec-name"
                    type="text"
                    className={inputClass('recName')}
                    placeholder="성함과 소속 매체명을 입력하세요"
                    value={recommender.name}
                    onChange={(e) => setRecommender({ ...recommender, name: e.target.value })}
                  />
                  {errors.recName && <span className={styles.errorMsg}>필수 항목입니다.</span>}
                </div>

                <div className={styles.field}>
                  <label className={styles.label} htmlFor="rec-phone">
                    연락처 <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="rec-phone"
                    type="tel"
                    className={inputClass('recPhone')}
                    placeholder="010-0000-0000"
                    value={recommender.phone}
                    onChange={(e) => setRecommender({ ...recommender, phone: e.target.value })}
                  />
                  {errors.recPhone && <span className={styles.errorMsg}>필수 항목입니다.</span>}
                </div>

                <div className={`${styles.field} ${styles.fieldFull}`}>
                  <label className={styles.label} htmlFor="rec-email">
                    이메일 <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="rec-email"
                    type="email"
                    className={inputClass('recEmail')}
                    placeholder="example@press.com"
                    value={recommender.email}
                    onChange={(e) => setRecommender({ ...recommender, email: e.target.value })}
                  />
                  {errors.recEmail && (
                    <span className={styles.errorMsg}>유효한 이메일을 입력하세요.</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 2단계 — 추천 대상자 정보 */}
          {step === 2 && (
            <div>
              <h3 className={styles.panelTitle}>추천 대상자 정보</h3>
              <div className={styles.fieldGrid}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="nom-name">
                    성함 (또는 팀명) <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="nom-name"
                    type="text"
                    className={inputClass('nomName')}
                    placeholder="추천하고자 하는 언론인 성함"
                    value={nominee.name}
                    onChange={(e) => setNominee({ ...nominee, name: e.target.value })}
                  />
                  {errors.nomName && <span className={styles.errorMsg}>필수 항목입니다.</span>}
                </div>

                <div className={styles.field}>
                  <label className={styles.label} htmlFor="nom-org">
                    소속 매체 / 부서 <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="nom-org"
                    type="text"
                    className={inputClass('nomOrg')}
                    placeholder="추천 대상자의 소속사 및 부서"
                    value={nominee.org}
                    onChange={(e) => setNominee({ ...nominee, org: e.target.value })}
                  />
                  {errors.nomOrg && <span className={styles.errorMsg}>필수 항목입니다.</span>}
                </div>

                <div className={`${styles.field} ${styles.fieldFull}`}>
                  <label className={styles.label} htmlFor="nom-career">
                    주요 경력 (선택)
                  </label>
                  <input
                    id="nom-career"
                    type="text"
                    className={styles.input}
                    placeholder="해당 언론인의 주요 보도 분야 등"
                    value={nominee.career}
                    onChange={(e) => setNominee({ ...nominee, career: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 3단계 — 제출 서류 */}
          {step === 3 && (
            <div>
              <div className={styles.worksHead}>
                <h3 className={styles.worksHeadTitle}>제출 서류 (자료 정보)</h3>
                <span className={styles.worksCount}>
                  {works.length} / {MAX_WORKS}
                </span>
              </div>
              <p className={styles.worksNote}>
                추천하시는 자료를 <strong className={styles.worksNoteStrong}>최대 5개까지</strong>{' '}
                추가하실 수 있습니다.
              </p>

              <div className={styles.workList}>
                {works.map((work, index) => (
                  <div key={work.id} className={styles.workEntry}>
                    <div className={styles.workEntryHead}>
                      <span className={styles.workEntryLabel}>자료 {index + 1}</span>
                      {works.length > 1 && (
                        <button
                          type="button"
                          className={styles.removeWork}
                          onClick={() => removeWork(work.id)}
                        >
                          <Icon name="delete" className={styles.removeWorkIcon} />
                          삭제
                        </button>
                      )}
                    </div>

                    <div className={styles.workFields}>
                      <div className={styles.field}>
                        <label className={styles.label} htmlFor={`work-title-${work.id}`}>
                          자료 제목 <span className={styles.required}>*</span>
                        </label>
                        <input
                          id={`work-title-${work.id}`}
                          type="text"
                          className={inputClass(`work-${work.id}-title`)}
                          placeholder="기사 또는 프로그램 제목을 입력하세요"
                          value={work.title}
                          onChange={(e) => updateWork(work.id, { title: e.target.value })}
                        />
                        {errors[`work-${work.id}-title`] && (
                          <span className={styles.errorMsg}>필수 항목입니다.</span>
                        )}
                      </div>

                      <div className={styles.field}>
                        <label className={styles.label} htmlFor={`work-url-${work.id}`}>
                          인터넷 주소(URL)
                        </label>
                        <input
                          id={`work-url-${work.id}`}
                          type="url"
                          className={styles.input}
                          placeholder="https://..."
                          value={work.url}
                          onChange={(e) => updateWork(work.id, { url: e.target.value })}
                        />
                      </div>

                      <div className={styles.field}>
                        <label className={styles.label} htmlFor={`work-date-${work.id}`}>
                          알린 날짜 <span className={styles.required}>*</span>
                        </label>
                        <input
                          id={`work-date-${work.id}`}
                          type="date"
                          className={inputClass(`work-${work.id}-date`)}
                          value={work.date}
                          onChange={(e) => updateWork(work.id, { date: e.target.value })}
                        />
                        {errors[`work-${work.id}-date`] && (
                          <span className={styles.errorMsg}>필수 항목입니다.</span>
                        )}
                      </div>

                      <div className={styles.field}>
                        <label className={styles.label} htmlFor={`work-category-${work.id}`}>
                          부문 선택 <span className={styles.required}>*</span>
                        </label>
                        <select
                          id={`work-category-${work.id}`}
                          className={inputClass(`work-${work.id}-category`)}
                          value={work.category}
                          onChange={(e) => updateWork(work.id, { category: e.target.value })}
                        >
                          <option value="">부문을 선택하세요</option>
                          {CATEGORIES.map((category) => (
                            <option key={category.value} value={category.value}>
                              {category.label}
                            </option>
                          ))}
                        </select>
                        {errors[`work-${work.id}-category`] && (
                          <span className={styles.errorMsg}>부문을 선택하세요.</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {works.length < MAX_WORKS && (
                <button type="button" className={styles.addWork} onClick={addWork}>
                  <Icon name="add" />
                  자료 추가하기
                </button>
              )}
            </div>
          )}

          {/* 4단계 — 추천 사유 */}
          {step === 4 && (
            <div>
              <h3 className={styles.panelTitle}>추천 사유</h3>
              <div className={styles.reasonField}>
                <label className={styles.label} htmlFor="reason-text">
                  추천 근거 및 사유 (최대 1,000자) <span className={styles.required}>*</span>
                </label>
                <textarea
                  id="reason-text"
                  className={errors.reason ? styles.textareaError : styles.textarea}
                  rows={8}
                  maxLength={MAX_REASON}
                  placeholder="우리말을 바르게 사용하기 위한 노력이나, 해당 보도가 언어 문화 개선에 기여한 바를 구체적으로 적어주세요."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <div className={styles.reasonMeta}>
                  {errors.reason && <span className={styles.errorMsg}>추천 사유를 입력해주세요.</span>}
                  <span className={styles.charCount}>
                    {reason.length.toLocaleString()} / 1,000자
                  </span>
                </div>
              </div>

              <div className={styles.consentRow}>
                <input
                  id="consent"
                  type="checkbox"
                  className={styles.consentBox}
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <label className={styles.consentLabel} htmlFor="consent">
                  제출된 정보는 시상 심사 목적으로만 사용되며, 개인정보 처리방침에 따라 안전하게
                  관리됨에 동의합니다. <span className={styles.required}>*</span>
                </label>
              </div>
              {errors.consent && <span className={styles.consentError}>동의가 필요합니다.</span>}
            </div>
          )}

          <div className={styles.nav}>
            <button
              type="button"
              className={step === 1 ? styles.prevHidden : styles.prev}
              onClick={handlePrev}
            >
              <Icon name="arrow_back" />
              이전 단계
            </button>

            <div>
              {step < TOTAL_STEPS ? (
                <button type="button" className={styles.next} onClick={handleNext}>
                  <span>다음으로</span>
                  <Icon name="arrow_forward" />
                </button>
              ) : (
                <button type="submit" className={styles.submit} disabled={submitting}>
                  {submitting ? '제출 중...' : '추천서 제출하기'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      {submitted && (
        <div className={styles.successOverlay} role="alertdialog" aria-label="접수 완료">
          <div className={styles.successInner}>
            <Icon name="verified" className={styles.successIcon} filled />
            <h2 className={styles.successTitle}>추천서가 접수되었습니다</h2>
            <p className={styles.successBody}>
              소중한 추천 감사합니다.
              <br />
              심사 결과는 추천인 이메일로 안내해 드립니다.
            </p>
            <div className={styles.successActions}>
              {/* 이동하면 이 화면이 사라지면서 막아 둔 스크롤도 함께 풀립니다. */}
              <Link to={paths.home} className={styles.successGold}>
                홈으로 돌아가기
              </Link>
              <Link to={paths.winners} className={styles.successOutline}>
                우리말 수상자 보기
              </Link>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export default NominationPage
