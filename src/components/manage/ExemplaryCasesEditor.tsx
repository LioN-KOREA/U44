import { useState } from 'react'
import Icon from '../Icon'
import {
  emptyExemplaryCase,
  type ExemplaryPair,
  type RawExemplaryCase,
  type RawExemplaryCasesConfig,
} from '../../data/exemplaryCases'
import { seoulYearMonth } from '../../data/manage'
import styles from '../../pages/ManagePage.module.css'

/**
 * 우리말 우수사례 편집.
 *
 * 칸의 순서와 모양은 화면 쪽에 고정되어 있으므로(ExemplaryCaseTemplate), 여기서는 각 칸의
 * 제목·머리말과 낱말 짝만 채웁니다. 어떤 칸을 어떻게 그릴지는 고르지 않습니다 - 고를 수 있게
 * 하면 달마다 생김새가 달라져, 같은 틀로 묶은 뜻이 없어집니다.
 */

/** 낱말 짝 목록 하나를 편집합니다. */
function PairListEditor({
  label,
  hint,
  pairs,
  onChange,
}: {
  label: string
  hint?: string
  pairs: ExemplaryPair[]
  onChange: (pairs: ExemplaryPair[]) => void
}) {
  const replace = (index: number, changes: Partial<ExemplaryPair>) =>
    onChange(pairs.map((pair, i) => (i === index ? { ...pair, ...changes } : pair)))

  return (
    <div className={styles.subSection}>
      <div className={styles.subHead}>
        <h4 className={styles.fieldLabel}>{label} ({pairs.length})</h4>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => onChange([...pairs, { from: '', to: '' }])}
        >
          <Icon name="add" /> 낱말 추가
        </button>
      </div>
      {hint && <p className={styles.hint}>{hint}</p>}
      <div className={styles.pairList}>
        {pairs.map((pair, index) => (
          <div key={index} className={styles.pairRow}>
            <input
              type="text"
              className={styles.input}
              placeholder="바꾸기 전"
              aria-label={`${label} ${index + 1} - 바꾸기 전`}
              value={pair.from}
              onChange={(e) => replace(index, { from: e.target.value })}
            />
            <Icon name="arrow_forward" className={styles.pairArrow} />
            <input
              type="text"
              className={styles.input}
              placeholder="바꾼 뒤"
              aria-label={`${label} ${index + 1} - 바꾼 뒤`}
              value={pair.to}
              onChange={(e) => replace(index, { to: e.target.value })}
            />
            <button
              type="button"
              className={styles.iconButton}
              aria-label={`${label} ${index + 1} 지우기`}
              onClick={() => onChange(pairs.filter((_, i) => i !== index))}
            >
              <Icon name="delete" />
            </button>
          </div>
        ))}
        {pairs.length === 0 && <p className={styles.emptyNote}>비어 있으면 이 묶음은 그리지 않습니다.</p>}
      </div>
    </div>
  )
}

/** 제목·머리말·낱말 짝으로 이루어진 보통 칸. */
/** 칸 하나를 감싸는 카드. 머리에 몇 번째 칸인지 적습니다. */
function SectionCard({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className={styles.sectionCard}>
      <h4 className={styles.cardTitle}>{heading}</h4>
      {children}
    </div>
  )
}

/**
 * 제목·머리말·낱말 짝으로 이루어진 보통 칸.
 *
 * 5번 칸은 덧붙는 입력이 있어 children 으로 받습니다. 카드 안에 카드를 또 두면 여백이 겹칩니다.
 */
function SectionEditor({
  heading,
  section,
  onChange,
  children,
}: {
  heading: string
  section: { title: string; lead: string; pairs: ExemplaryPair[] }
  onChange: (changes: Partial<{ title: string; lead: string; pairs: ExemplaryPair[] }>) => void
  children?: React.ReactNode
}) {
  return (
    <SectionCard heading={heading}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>제목</span>
        <input
          type="text"
          className={styles.input}
          value={section.title}
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>머리말</span>
        <textarea
          className={styles.textarea}
          rows={2}
          value={section.lead}
          onChange={(e) => onChange({ lead: e.target.value })}
        />
      </label>
      {children}
      <PairListEditor label="낱말" pairs={section.pairs} onChange={(pairs) => onChange({ pairs })} />
    </SectionCard>
  )
}

function CaseEditor({
  item,
  onChange,
  onRemove,
}: {
  item: RawExemplaryCase
  onChange: (changes: Partial<RawExemplaryCase>) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <article className={styles.ceremony}>
      <div className={styles.ceremonyHead}>
        <button type="button" className={styles.disclosure} aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon name={open ? 'expand_more' : 'chevron_right'} />
          <span className={styles.ceremonyTitle}>
            {item.exemplaryCaseYear}년 {item.exemplaryCaseMonth}월
          </span>
        </button>
        <button type="button" className={styles.dangerButton} onClick={onRemove}>
          <Icon name="delete" /> 삭제
        </button>
      </div>

      {open && (
        <div className={styles.ceremonyBody}>
          <div className={styles.compactGrid}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>연도</span>
              <input
                type="number"
                className={styles.input}
                value={item.exemplaryCaseYear}
                onChange={(e) => onChange({ exemplaryCaseYear: Number(e.target.value) })}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>월</span>
              <input
                type="number"
                min={1}
                max={12}
                className={styles.input}
                value={item.exemplaryCaseMonth}
                onChange={(e) => onChange({ exemplaryCaseMonth: Number(e.target.value) })}
              />
            </label>
          </div>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>머리말 인용구</span>
            <textarea
              className={styles.textarea}
              rows={3}
              value={item.lead}
              onChange={(e) => onChange({ lead: e.target.value })}
            />
          </label>

          <SectionEditor
            heading="1. 익숙한 외국어·외래어 대신 우리말로"
            section={item.foreignToKorean}
            onChange={(changes) => onChange({ foreignToKorean: { ...item.foreignToKorean, ...changes } })}
          />
          <SectionEditor
            heading="2. 어려운 표현을 쉽고 자연스럽게"
            section={item.plainerWording}
            onChange={(changes) => onChange({ plainerWording: { ...item.plainerWording, ...changes } })}
          />
          <SectionEditor
            heading="3. 약어와 전문용어는 알기 쉽게"
            section={item.abbreviations}
            onChange={(changes) => onChange({ abbreviations: { ...item.abbreviations, ...changes } })}
          />
          <SectionEditor
            heading="4. 한 단어 대신 뜻을 풀어 쓴 표현"
            section={item.glosses}
            onChange={(changes) => onChange({ glosses: { ...item.glosses, ...changes } })}
          />

          {/* 5번 칸에는 설명 상자가 하나 더 붙습니다. */}
          <SectionEditor
            heading="5. 보다 정확하고 신중한 표현"
            section={item.carefulWording}
            onChange={(changes) => onChange({ carefulWording: { ...item.carefulWording, ...changes } })}
          >
            <label className={styles.field}>
              <span className={styles.fieldLabel}>덧붙이는 설명 — 제목</span>
              <input
                type="text"
                className={styles.input}
                value={item.carefulWording.noteTitle}
                onChange={(e) =>
                  onChange({ carefulWording: { ...item.carefulWording, noteTitle: e.target.value } })
                }
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>덧붙이는 설명 — 본문</span>
              <textarea
                className={styles.textarea}
                rows={3}
                value={item.carefulWording.noteBody}
                onChange={(e) =>
                  onChange({ carefulWording: { ...item.carefulWording, noteBody: e.target.value } })
                }
              />
              <p className={styles.hint}>비워 두면 설명 상자를 그리지 않습니다.</p>
            </label>
          </SectionEditor>

          {/*
            6번 칸에는 맞춤법 짝이 따로 붙습니다. 화면에서도 낱말 목록 아래에 나오므로, 보통 칸의
            순서(제목 → 머리말 → 낱말) 뒤에 이어 붙입니다.
          */}
          <SectionCard heading="6. 방송 속 우리말 & 바른 표현">
            <label className={styles.field}>
              <span className={styles.fieldLabel}>제목</span>
              <input
                type="text"
                className={styles.input}
                value={item.broadcastTerms.title}
                onChange={(e) => onChange({ broadcastTerms: { ...item.broadcastTerms, title: e.target.value } })}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>머리말</span>
              <textarea
                className={styles.textarea}
                rows={2}
                value={item.broadcastTerms.lead}
                onChange={(e) => onChange({ broadcastTerms: { ...item.broadcastTerms, lead: e.target.value } })}
              />
            </label>
            <PairListEditor
              label="낱말"
              pairs={item.broadcastTerms.pairs}
              onChange={(pairs) => onChange({ broadcastTerms: { ...item.broadcastTerms, pairs } })}
            />
            <PairListEditor
              label="맞춤법이 헷갈리기 쉬운 표현"
              hint="위 낱말과 따로 묶어 아래에 보여 줍니다."
              pairs={item.broadcastTerms.spellingPairs}
              onChange={(spellingPairs) =>
                onChange({ broadcastTerms: { ...item.broadcastTerms, spellingPairs } })
              }
            />
          </SectionCard>

          <SectionEditor
            heading="7. 우리말로 자리 잡아 가는 표현"
            section={item.settlingIn}
            onChange={(changes) => onChange({ settlingIn: { ...item.settlingIn, ...changes } })}
          />

          {/* 8번 칸은 두 묶음으로 나뉘는 안내 상자입니다. */}
          <SectionCard heading="8. 앞으로 눈여겨볼 우리말 표현">
            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>제목</span>
                <input
                  type="text"
                  className={styles.input}
                  value={item.recommended.title}
                  onChange={(e) => onChange({ recommended: { ...item.recommended, title: e.target.value } })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>안내 상자 제목</span>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="적극 권장 순화어"
                  value={item.recommended.calloutTitle}
                  onChange={(e) =>
                    onChange({ recommended: { ...item.recommended, calloutTitle: e.target.value } })
                  }
                />
              </label>
            </div>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>안내 문구</span>
              <textarea
                className={styles.textarea}
                rows={2}
                value={item.recommended.lead}
                onChange={(e) => onChange({ recommended: { ...item.recommended, lead: e.target.value } })}
              />
            </label>
            {item.recommended.groups.map((group, groupIndex) => (
              <PairListEditor
                key={groupIndex}
                label={`${groupIndex + 1}번째 묶음`}
                pairs={group}
                onChange={(pairs) =>
                  onChange({
                    recommended: {
                      ...item.recommended,
                      groups: item.recommended.groups.map((g, i) => (i === groupIndex ? pairs : g)),
                    },
                  })
                }
              />
            ))}
            <div className={styles.subHead}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() =>
                  onChange({ recommended: { ...item.recommended, groups: [...item.recommended.groups, []] } })
                }
              >
                <Icon name="add" /> 묶음 추가
              </button>
              {item.recommended.groups.length > 0 && (
                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={() =>
                    onChange({
                      recommended: { ...item.recommended, groups: item.recommended.groups.slice(0, -1) },
                    })
                  }
                >
                  <Icon name="delete" /> 마지막 묶음 빼기
                </button>
              )}
            </div>
          </SectionCard>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>맨 아래 출처 문구</span>
            <textarea
              className={styles.textarea}
              rows={2}
              placeholder="※ …"
              value={item.sourceNote}
              onChange={(e) => onChange({ sourceNote: e.target.value })}
            />
          </label>
        </div>
      )}
    </article>
  )
}

function ExemplaryCasesEditor({
  config,
  onChange,
}: {
  config: RawExemplaryCasesConfig
  onChange: (changes: Partial<RawExemplaryCasesConfig>) => void
}) {
  const cases = config.exemplaryCases

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>우리말 우수사례 ({cases.length})</h2>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => {
            const { year, month } = seoulYearMonth(Date.now())
            onChange({ exemplaryCases: [...cases, emptyExemplaryCase(year, month)] })
          }}
        >
          <Icon name="add" /> 회차 추가
        </button>
      </div>
      <p className={styles.hint}>
        여덟 칸의 순서와 생김새는 정해져 있습니다. 글과 낱말만 채우면 되고, 비워 둔 칸은 화면에
        그리지 않습니다.
      </p>

      {cases.length === 0 && <p className={styles.status}>등록된 우수사례가 없습니다.</p>}
      <div className={styles.ceremonyList}>
        {cases.map((item, index) => (
          <CaseEditor
            key={index}
            item={item}
            onChange={(changes) =>
              onChange({ exemplaryCases: cases.map((c, i) => (i === index ? { ...c, ...changes } : c)) })
            }
            onRemove={() => onChange({ exemplaryCases: cases.filter((_, i) => i !== index) })}
          />
        ))}
      </div>
    </section>
  )
}

export default ExemplaryCasesEditor
