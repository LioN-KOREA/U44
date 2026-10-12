import { useRef, useState } from 'react'
import Icon from '../Icon'
import { GlossaryFileError, readGlossaryFile } from '../../data/glossaryFile'
import type { RawGlossaryConfig } from '../../data/terms'
import styles from '../../pages/ManagePage.module.css'

/**
 * 우리말 개선 용어 편집.
 *
 * 2,500개가 넘는 낱말을 한 줄씩 손보게 하는 것은 현실적이지 않아, 파일을 통째로 올려 바꿉니다.
 * 파일은 브라우저에서 읽습니다 - 그래야 올리기가 요청 한 번으로 끝나고, 서버에 스프레드시트
 * 해석기를 둘 필요가 없습니다.
 */
function GlossaryEditor({
  config,
  onReplace,
}: {
  config: RawGlossaryConfig
  onReplace: (pairs: RawGlossaryConfig['glossary']) => void
}) {
  const fileInput = useRef<HTMLInputElement | null>(null)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** 방금 읽어 들인 결과. 저장 전에 무엇이 바뀌는지 보여 주려고 들고 있습니다. */
  const [lastRead, setLastRead] = useState<{ added: number; skipped: number } | null>(null)

  const onPick = async (file: File | undefined) => {
    if (!file) return
    setReading(true)
    setError(null)
    setLastRead(null)
    try {
      const result = await readGlossaryFile(file)
      onReplace(result.pairs)
      setLastRead({ added: result.pairs.length, skipped: result.rowsSkipped })
    } catch (err) {
      console.error(err)
      setError(
        err instanceof GlossaryFileError ? err.message : '파일을 읽지 못했습니다.',
      )
    } finally {
      setReading(false)
    }
  }

  const preview = config.glossary.slice(0, 5)

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>우리말 개선 용어 ({config.glossary.length.toLocaleString('ko-KR')})</h2>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => fileInput.current?.click()}
          disabled={reading}
        >
          <Icon name="upload" /> {reading ? '읽는 중…' : '파일로 바꾸기'}
        </button>
        <input
          ref={fileInput}
          type="file"
          className={styles.hiddenInput}
          accept=".xlsx,.xlsm,.csv"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = '' // 같은 파일을 다시 골라도 동작하도록 비웁니다.
            void onPick(file)
          }}
        />
      </div>
      <p className={styles.hint}>
        XLSX 또는 CSV 를 올리면 목록 전체가 그 파일로 바뀝니다. <strong>A열은 바꾸기 전 말,
        B열은 권장하는 우리말</strong>로 읽고, <strong>첫 줄은 머리글로 보아 건너뜁니다.</strong>{' '}
        나머지 열은 무시합니다. 올린 뒤 위쪽의 ‘저장’ 을 눌러야 사이트에 반영됩니다.
      </p>

      {error && <p className={styles.error}>{error}</p>}
      {lastRead && (
        <p className={styles.hint}>
          {lastRead.added.toLocaleString('ko-KR')}개를 읽었습니다
          {lastRead.skipped > 0 && ` (빈 줄 ${lastRead.skipped.toLocaleString('ko-KR')}개는 건너뛰었습니다)`}.
          저장하면 기존 목록을 대신합니다.
        </p>
      )}

      {config.glossary.length === 0 ? (
        <p className={styles.status}>등록된 용어가 없습니다.</p>
      ) : (
        <div className={styles.ceremony}>
          <div className={styles.ceremonyBody}>
            <p className={styles.hint}>맨 앞 다섯 개만 미리 보여 줍니다.</p>
            <table className={styles.termTable}>
              <thead>
                <tr>
                  <th scope="col">바꾸기 전</th>
                  <th scope="col">권장하는 우리말</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((pair, index) => (
                  <tr key={index}>
                    <td>{pair.original}</td>
                    <td>{pair.recommended}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

export default GlossaryEditor
