/**
 * 큰 사진에서 목록·격자용 축소본을 미리 만들어 둡니다.
 *
 *   node scripts/generate-thumbnails.mjs          # 새로 생긴 것만
 *   node scripts/generate-thumbnails.mjs --force  # 전부 다시
 *
 * 원본(수천 픽셀, 수 MB)은 확대 보기에서만 쓰고, 화면에 여러 장이 깔리는
 * 곳에는 여기서 만든 _tn / _md 를 씁니다. 브라우저에서 캔버스로 줄이는 방식은
 * 원본을 통째로 내려받은 뒤에야 줄이는 것이라 정작 느린 부분(전송·디코딩)이
 * 그대로 남습니다. 그래서 미리 만들어 두는 쪽을 택했습니다.
 */
import { readdir, stat, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

/** 만들어 낼 축소본 규격. 접미사는 파일명 규칙(_tn/_md)과 같습니다. */
const VARIANTS = [
  { suffix: '_tn', width: 480 },
  { suffix: '_md', width: 1440 },
]

/** 훑어볼 디렉터리 (public 기준). */
/*
 * public 아래 전체를 훑습니다.
 *
 * 예전에는 awards/ 와 instagram_posts/ 만 봤지만, 그 사진들은 이제 관리 화면에서 올리고 백엔드가
 * 축소본을 만듭니다. 남아서 이 스크립트가 필요한 것은 사이트와 함께 배포되는 사진들이고
 * (default-main.png 처럼) 그것들은 public 바로 아래에 있습니다.
 */
const TARGET_DIRS = ['']

const SOURCE_EXT = new Set(['.jpg', '.jpeg', '.png'])
const PUBLIC_DIR = path.resolve('public')
const force = process.argv.includes('--force')

/** 이미 축소본인 파일( ..._tn.jpg )은 원본으로 다시 처리하지 않습니다. */
function isDerivative(basename) {
  return VARIANTS.some((variant) => basename.includes(`${variant.suffix}.`))
}

async function* walk(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else yield full
  }
}

/** 원본보다 새 축소본이 있으면 건너뜁니다. */
async function isFresh(sourcePath, outputPath) {
  if (force || !existsSync(outputPath)) return false
  const [source, output] = await Promise.all([stat(sourcePath), stat(outputPath)])
  return output.mtimeMs >= source.mtimeMs
}

async function processImage(sourcePath) {
  const dir = path.dirname(sourcePath)
  const ext = path.extname(sourcePath)
  const base = path.basename(sourcePath, ext)
  const image = sharp(sourcePath, { failOn: 'none' })
  const meta = await image.metadata()
  const results = []

  for (const variant of VARIANTS) {
    // 원본이 이미 목표 너비보다 작으면 굳이 키우지 않습니다.
    const width = Math.min(variant.width, meta.width ?? variant.width)

    for (const format of ['webp', 'jpeg']) {
      const outExt = format === 'webp' ? '.webp' : ext.toLowerCase() === '.png' ? '.png' : '.jpg'
      const outputPath = path.join(dir, `${base}${variant.suffix}${outExt}`)
      if (await isFresh(sourcePath, outputPath)) continue

      const pipeline = sharp(sourcePath, { failOn: 'none' }).resize({
        width,
        withoutEnlargement: true,
      })

      if (format === 'webp') {
        await pipeline.webp({ quality: 78, effort: 5 }).toFile(outputPath)
      } else if (outExt === '.png') {
        // PNG 원본은 팔레트로 줄여야 실질적인 이득이 납니다.
        await pipeline.png({ quality: 80, compressionLevel: 9, palette: true }).toFile(outputPath)
      } else {
        await pipeline.jpeg({ quality: 80, mozjpeg: true }).toFile(outputPath)
      }

      results.push(outputPath)
    }
  }

  return results
}

/**
 * public 아래 파일·폴더 이름에 한글 등 ASCII 가 아닌 글자가 있는지 확인합니다.
 *
 * Windows 의 Node 24 에서는 fs.rmSync 가 이런 이름의 파일을 지우다가 아무 메시지 없이
 * 프로세스를 끝내 버립니다(exit 127). Vite 는 빌드 전에 dist 를 rmSync 로 비우므로,
 * 첫 빌드는 되지만 그다음 빌드부터 조용히 멈춥니다. 원인을 찾기 어려우니 여기서 미리 막습니다.
 * 내려받을 때 한글 이름이 필요하면 <a download="한글이름.확장자"> 를 쓰면 됩니다.
 */
async function checkPublicFilenames() {
  const offending = []
  const visit = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      // 출력 가능한 ASCII(공백 ~ 물결표) 밖의 글자가 있으면 문제입니다.
      if (/[^\x20-\x7E]/.test(entry.name)) offending.push(path.relative(PUBLIC_DIR, full))
      if (entry.isDirectory()) await visit(full)
    }
  }
  await visit(PUBLIC_DIR)

  if (offending.length > 0) {
    console.error('')
    console.error('  오류: public 아래에 영문이 아닌 이름의 파일이 있습니다.')
    for (const file of offending) console.error(`    - ${file}`)
    console.error('  Windows 의 Node 24 에서는 이런 파일 때문에 두 번째 빌드부터 아무 메시지 없이 멈춥니다.')
    console.error('  파일 이름을 영문으로 바꾸고, 필요하면 링크에 download="한글이름.확장자" 를 지정하세요.')
    console.error('')
    process.exit(1)
  }
}

async function main() {
  await checkPublicFilenames()

  const sources = []
  for (const target of TARGET_DIRS) {
    const dir = path.join(PUBLIC_DIR, target)
    if (!existsSync(dir)) continue
    await mkdir(dir, { recursive: true })
    for await (const file of walk(dir)) {
      const ext = path.extname(file).toLowerCase()
      const base = path.basename(file)
      if (SOURCE_EXT.has(ext) && !isDerivative(base)) sources.push(file)
    }
  }

  if (sources.length === 0) {
    console.log('처리할 이미지가 없습니다.')
    return
  }

  let written = 0
  let bytesBefore = 0
  let bytesAfter = 0

  for (const source of sources) {
    const created = await processImage(source)
    if (created.length === 0) continue
    written += created.length
    bytesBefore += (await stat(source)).size
    for (const file of created) bytesAfter += (await stat(file)).size
    console.log(`  ${path.relative(PUBLIC_DIR, source)} -> ${created.length}개`)
  }

  const mb = (bytes) => (bytes / 1048576).toFixed(1)
  console.log(
    written === 0
      ? '모든 축소본이 최신입니다.'
      : `축소본 ${written}개 생성. 원본 ${mb(bytesBefore)}MB 기준 -> 축소본 합계 ${mb(bytesAfter)}MB`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
