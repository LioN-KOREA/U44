import type { TermPair } from './terms'

/**
 * 관리 화면에서 올린 XLSX·CSV 를 낱말 짝으로 바꿉니다.
 *
 * 브라우저에서 읽는 이유는 간단합니다: 이렇게 하면 올리기가 요청 한 번으로 끝납니다. 파일을
 * 그대로 보내려면 프리사인 발급 → S3 업로드 → 확정의 세 번을 거치고, 람다에 스프레드시트
 * 해석기까지 넣어야 합니다. 낱말 전체가 JSON 으로 100KB 남짓이라 그럴 값어치가 없습니다.
 *
 * 읽는 규칙은 하나입니다: **A열(바꾸기 전)과 B열(권장) 만, 2행부터.** 1행은 머리글로 보고
 * 건너뜁니다. 나머지 열은 메모가 적혀 있어도 무시합니다.
 */

/** 첫 줄은 머리글입니다. */
const HEADER_ROWS = 1

export interface GlossaryFileResult {
  pairs: TermPair[]
  /** 읽어 들인 전체 줄 (머리글 제외). 건너뛴 줄을 알려 주려고 셉니다. */
  rowsRead: number
  /** 한쪽이 비어 있어 버린 줄 수. */
  rowsSkipped: number
}

export class GlossaryFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GlossaryFileError'
  }
}

/** 두 칸짜리 줄들을 낱말 짝으로. 양쪽이 모두 있는 줄만 남깁니다. */
function toPairs(rows: (readonly [unknown, unknown])[]): GlossaryFileResult {
  const pairs: TermPair[] = []
  let skipped = 0
  for (const [a, b] of rows) {
    const original = String(a ?? '').trim()
    const recommended = String(b ?? '').trim()
    if (original === '' || recommended === '') {
      skipped++
      continue
    }
    pairs.push({ original, recommended })
  }
  return { pairs, rowsRead: rows.length, rowsSkipped: skipped }
}

/**
 * CSV 한 줄을 칸으로 나눕니다.
 *
 * 따옴표 안의 쉼표와 줄바꿈, 그리고 따옴표를 두 번 쓴 이스케이프(`""`)를 다룹니다. 낱말에
 * 쉼표가 들어 있는 경우가 실제로 있어서, 단순히 `split(',')` 로는 어긋납니다.
 */
function parseCsv(text: string): (readonly [unknown, unknown])[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  // BOM 이 붙어 있으면 첫 칸의 첫 글자가 되어 버립니다.
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      // CRLF 는 한 줄로 셉니다.
      if (ch === '\r' && body[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== '')).map((r) => [r[0], r[1]] as const)
}

/**
 * XLSX 를 읽습니다.
 *
 * 해석기는 쓸 때만 내려받습니다 (동적 import). 400KB 가 넘는 라이브러리라, 관리 화면에서
 * 파일을 고를 때까지 방문자에게 보낼 이유가 없습니다.
 */
async function parseXlsx(file: File): Promise<(readonly [unknown, unknown])[]> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new GlossaryFileError('시트가 없는 파일입니다.')
  const sheet = workbook.Sheets[sheetName]
  // header: 1 -> 각 줄을 칸의 배열로. 머리글 이름에 기대지 않고 A·B 열만 자리로 집습니다.
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' })
  return rows.map((r) => [r[0], r[1]] as const)
}

/** 확장자로 형식을 가립니다. 브라우저가 주는 MIME 은 환경마다 제각각입니다. */
export function isSupportedGlossaryFile(fileName: string): boolean {
  return /\.(xlsx|xlsm|csv)$/i.test(fileName.trim())
}

/**
 * 올린 파일에서 낱말 짝을 뽑습니다.
 *
 * @throws GlossaryFileError 형식이 아니거나 쓸 수 있는 줄이 하나도 없을 때.
 */
export async function readGlossaryFile(file: File): Promise<GlossaryFileResult> {
  if (!isSupportedGlossaryFile(file.name)) {
    throw new GlossaryFileError('XLSX 또는 CSV 파일만 올릴 수 있습니다.')
  }

  let rows: (readonly [unknown, unknown])[]
  try {
    rows = /\.csv$/i.test(file.name) ? parseCsv(await file.text()) : await parseXlsx(file)
  } catch (err) {
    console.error(err)
    throw new GlossaryFileError('파일을 읽지 못했습니다. 손상되지 않은 XLSX·CSV 인지 확인해 주세요.')
  }

  // 1행은 머리글이므로 버립니다.
  const result = toPairs(rows.slice(HEADER_ROWS))
  if (result.pairs.length === 0) {
    throw new GlossaryFileError(
      '읽을 수 있는 용어가 없습니다. 첫 줄은 머리글로 건너뛰고, A열(바꾸기 전)과 B열(권장)을 읽습니다.',
    )
  }
  return result
}
