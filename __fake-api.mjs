// 관리 화면을 실제로 눌러 보기 위한 로컬 백엔드 흉내.
// 실제 백엔드와 같은 경로·같은 키 규칙·같은 응답 모양을 씁니다(업로드는 presign -> PUT -> confirm,
// confirm 에서 sharp 로 480px 축소본 생성 + 자산 레코드 기록). S3/DynamoDB 대신 메모리에 담습니다.
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import sharp from 'sharp'

const PORT = Number(process.env.PORT || 5299)
// 여러 오리진을 받습니다 (개발 서버 5199, 배포본 흉내 4300 등).
const ORIGINS = (process.env.ALLOWED_ORIGIN || 'http://localhost:5199,http://localhost:4300')
  .split(',').map((o) => o.trim()).filter(Boolean)
const SELF = `http://localhost:${PORT}`
const CONFIG_PATH = process.env.CONFIG_PATH
const PUBLIC_DIR = process.env.PUBLIC_DIR ? resolve(process.env.PUBLIC_DIR) : ''
const UPSTREAM = process.env.UPSTREAM ? process.env.UPSTREAM.replace(/\/+$/, '') : ''
/* 관리 API 를 지키는 쪽. 실제 백엔드와 같은 규칙(토큰 검증 -> 권한 확인)을 흉내 냅니다. */
const AUTH_UPSTREAM = process.env.AUTH_UPSTREAM ? process.env.AUTH_UPSTREAM.replace(/\/+$/, '') : ''
const AUTH_CLIENT_ID = process.env.AUTH_CLIENT_ID || 'falm03vg6r35htb27ctg7rjda'
const MANAGE_AUTHORITY = process.env.MANAGE_AUTHORITY || '519093fd-d789-4853-b117-45187186ccb3'

const IMAGES_PREFIX = 'images/'
const THUMBS_PREFIX = 'images/thumbnails/'
const ASSETS_PREFIX = 'assets/'
const TMP_IMAGES_PREFIX = 'tmp/images/'
const TMP_ASSETS_PREFIX = 'tmp/assets/'
const EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }
const ID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{1,8})?$/i

/** S3 대신: key -> { body: Buffer, contentType } */
const objects = new Map()
/** DynamoDB 대신: `${type}#${assetKey}` -> 레코드 */
const records = new Map()
/** 설정 (키 그대로 저장) */
let config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))

/* 홈 화면 기본값. 실제 백엔드(U44HomescreenManager) 와 같아야 합니다. */
const HOME_DEFAULTS = {
  mainBannerImage: '/default-main.png',
  mainBannerAltText: 'Main poster image',
  contactEmailAddr: 'kplain.urimal@gmail.com',
  businessHours: '09:00 - 18:00',
}
const seoulMonthNow = () => new Date(Date.now() + 32400000).getUTCMonth() + 1
const emptyHome = () => ({
  mainBannerImage: '', mainBannerAltText: '', contactEmailAddr: '', businessHours: '',
  homescreenRecommendationPopupConfig: { recommendationPopupOn: true, recommendationMonth: seoulMonthNow() },
  homescreenThisMonthAwardPopupConfig: { thisMonthAwardCeremonyPopupOn: false },
  homescreenConfigLastUpdated: 0,
})
const EMPTY_SOCIAL = { socialMediaPosts: [], profileURL: '', handle: '', socialMediaPostsConfigLastUpdated: 0 }
let homeConfig = emptyHome()
let socialConfig = { ...EMPTY_SOCIAL }

/* 우수사례(config3) · 용어집(config4). 자산 주소가 없어 공개용과 편집용이 같습니다. */
const EMPTY_EXAMPLES = { exemplaryCases: [], exemplaryCasesConfigLastUpdated: 0 }
const EMPTY_GLOSSARY = { lastUpdatedAt: 0, glossary: [] }
let examplesConfig = JSON.parse(JSON.stringify(EMPTY_EXAMPLES))
let glossaryConfig = JSON.parse(JSON.stringify(EMPTY_GLOSSARY))
const calls = []

const toURL = (key) => (key ? `${SELF}/${key.replace(/^\/+/, '')}` : '')
const uuid7 = () => {
  const ms = Date.now().toString(16).padStart(12, '0')
  const r = () => Math.floor(Math.random() * 16).toString(16)
  return `${ms.slice(0, 8)}-${ms.slice(8, 12)}-7${r()}${r()}${r()}-8${r()}${r()}${r()}-${Array.from({ length: 12 }, r).join('')}`
}

const prefixFor = (type, temp) =>
  type === 'image' ? (temp ? TMP_IMAGES_PREFIX : IMAGES_PREFIX) : temp ? TMP_ASSETS_PREFIX : ASSETS_PREFIX

const thumbKeyOf = (imageKey) => `${THUMBS_PREFIX}${imageKey.slice(IMAGES_PREFIX.length)}`

/** 레코드 -> API 가 내려 주는 AssetEntry. URL 은 키에서 만듭니다. */
const toEntry = (rec) => {
  const thumbnailKey = rec.assetType === 'image' ? thumbKeyOf(rec.assetKey) : ''
  return {
    assetType: rec.assetType,
    assetName: rec.assetName,
    assetKey: rec.assetKey,
    assetURL: toURL(rec.assetKey),
    assetContentType: rec.assetContentType,
    assetThumbnailKey: thumbnailKey,
    assetThumbnailURL: thumbnailKey ? toURL(thumbnailKey) : '',
    size: rec.size,
    created: rec.created,
    lastModified: rec.lastModified,
  }
}

/* ---- 설정의 자산 키를 절대 URL 로 바꿉니다 (basePath 는 이제 없습니다) ---- */
const u = (v) => (!v ? '' : /^https?:\/\//.test(v) ? v : toURL(v))
const ceremonyWithURLs = (entry) => ({
  ...entry,
  awardRepresentativePicture: u(entry.awardRepresentativePicture),
  awardWinners: (entry.awardWinners ?? []).map((s) => ({
    ...s,
    winners: (s.winners ?? []).map((w) => ({ ...w, image: u(w.image) })),
  })),
  awardCeremonyPictures: (entry.awardCeremonyPictures ?? []).map((p) => ({
    thumbnail: u(p.thumbnail),
    picture: u(p.picture),
  })),
})
const withAssetURLs = (cfg) => ({
  ...cfg,
  awardCeremonies: (cfg.awardCeremonies ?? []).map(ceremonyWithURLs),
  ...(cfg.awardCeremonyOfTheYear && {
    awardCeremonyOfTheYear: cfg.awardCeremonyOfTheYear.isAwardCeremonyComplete
      ? ceremonyWithURLs(cfg.awardCeremonyOfTheYear)
      : cfg.awardCeremonyOfTheYear,
  }),
})

const homeWithDefaults = (c) => {
  const chosen = c.mainBannerImage !== ''
  return {
    ...c,
    mainBannerImage: chosen ? u(c.mainBannerImage) : HOME_DEFAULTS.mainBannerImage,
    mainBannerAltText: chosen ? (c.mainBannerAltText || HOME_DEFAULTS.mainBannerAltText) : HOME_DEFAULTS.mainBannerAltText,
    contactEmailAddr: c.contactEmailAddr || HOME_DEFAULTS.contactEmailAddr,
    businessHours: c.businessHours || HOME_DEFAULTS.businessHours,
  }
}

const socialWithURLs = (c) => ({
  ...c,
  // href 는 게시글 주소라 절대 바꾸지 않습니다.
  socialMediaPosts: (c.socialMediaPosts ?? []).map((post) => ({ ...post, image: u(post.image) })),
})

const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
  })

createServer(async (req, res) => {
  const origin = req.headers.origin
  const cors = ORIGINS.includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' }
    : {}
  const url = new URL(req.url, SELF)
  const path = url.pathname
  const send = (status, body, extra = {}) => {
    const text = body === undefined ? '' : JSON.stringify(body)
    res.writeHead(status, { ...cors, 'Content-Type': 'application/json', ...extra })
    res.end(text)
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      ...cors,
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Sec-Token',
      // PUT 은 프리사인 업로드용입니다. 빠지면 브라우저가 업로드를 아예 보내지 않습니다.
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    })
    return res.end()
  }
  if (origin && !ORIGINS.includes(origin)) {
    res.writeHead(403, { Vary: 'Origin' })
    return res.end('')
  }
  calls.push(`${req.method} ${path}`)

  /*
   * 관리 API 는 로그인한 관리자만.
   *
   * 실제 백엔드는 JWKS 로 서명을 직접 검증하지만, 여기서는 가짜 인증 서버에 물어보는 것으로
   * 대신합니다. 프런트엔드가 토큰을 제대로 싣는지, 401/403 을 제대로 다루는지를 보는 것이
   * 목적이기 때문입니다.
   */
  if (AUTH_UPSTREAM && path.startsWith('/api/management/') && req.method !== 'OPTIONS') {
    const raw = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
    if (!raw) return send(401, 'Unauthenticated')
    let authorities = null
    try {
      const r = await fetch(`${AUTH_UPSTREAM}/lpx/auth/userInfo?clientId=${AUTH_CLIENT_ID}`, {
        headers: { Authorization: `Bearer ${raw}` },
      })
      if (r.ok) authorities = (await r.json())?.data?.authorities ?? []
    } catch { /* 아래에서 401 로 떨어집니다 */ }
    if (authorities === null) return send(401, 'Unauthenticated')
    if (!authorities.includes(MANAGE_AUTHORITY)) return send(403, 'Not permitted')
  }

  // ---- 공개 설정 ----
  if (path === '/api/v0/award-info' && req.method === 'GET') return send(200, withAssetURLs(config))

  // ---- 관리: 설정 ----
  if (path === '/api/management/v0/award-info' && req.method === 'GET') return send(200, config)
  if (path === '/api/management/v0/award-info' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || 'null')
    // 예전처럼 배열이 오면 거부합니다 (실제 백엔드도 스키마에서 막습니다).
    if (!body || typeof body !== 'object' || Array.isArray(body) || !Array.isArray(body.awardCeremonies)) {
      return send(400, 'An error occurred while validating the request')
    }
    config = { ...body, awardInfoConfigLastUpdated: Date.now() }
    return send(200, 'Request successful')
  }

  // ---- 공개: 홈 화면 · 누리소통망 ----
  if (path === '/api/v0/homescreen' && req.method === 'GET') return send(200, homeWithDefaults(homeConfig))
  if (path === '/api/v0/social-media-posts' && req.method === 'GET') return send(200, socialWithURLs(socialConfig))

  // ---- 관리: 홈 화면 ----
  if (path === '/api/management/v0/homescreen' && req.method === 'GET') return send(200, homeConfig)
  if (path === '/api/management/v0/homescreen' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || 'null')
    if (!body || typeof body !== 'object' || Array.isArray(body)) return send(400, 'An error occurred while validating the request')
    homeConfig = { ...emptyHome(), ...body, homescreenConfigLastUpdated: Date.now() }
    return send(200, 'Request successful')
  }

  // ---- 관리: 누리소통망 ----
  if (path === '/api/management/v0/social-media-posts' && req.method === 'GET') return send(200, socialConfig)
  if (path === '/api/management/v0/social-media-posts' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || 'null')
    if (!body || typeof body !== 'object' || Array.isArray(body) || !Array.isArray(body.socialMediaPosts)) {
      return send(400, 'An error occurred while validating the request')
    }
    socialConfig = { ...EMPTY_SOCIAL, ...body, socialMediaPostsConfigLastUpdated: Date.now() }
    return send(200, 'Request successful')
  }

  // ---- 우수사례 · 용어집 ----
  if (path === '/api/v0/exemplary-cases' && req.method === 'GET') return send(200, examplesConfig)
  if (path === '/api/v0/glossary' && req.method === 'GET') return send(200, glossaryConfig)
  if (path === '/api/management/v0/exemplary-cases' && req.method === 'GET') return send(200, examplesConfig)
  if (path === '/api/management/v0/glossary' && req.method === 'GET') return send(200, glossaryConfig)
  if (path === '/api/management/v0/exemplary-cases' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || 'null')
    if (!body || typeof body !== 'object' || Array.isArray(body) || !Array.isArray(body.exemplaryCases)) {
      return send(400, 'An error occurred while validating the request')
    }
    examplesConfig = { ...body, exemplaryCasesConfigLastUpdated: Date.now() }
    return send(200, 'Request successful')
  }
  if (path === '/api/management/v0/glossary' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || 'null')
    if (!body || typeof body !== 'object' || Array.isArray(body) || !Array.isArray(body.glossary)) {
      return send(400, 'An error occurred while validating the request')
    }
    glossaryConfig = { ...body, lastUpdatedAt: Date.now() }
    return send(200, 'Request successful')
  }

  // ---- 관리: 자산 (이미지 / 파일) ----
  const listMatch = path.match(/^\/api\/management\/v0\/(image|asset)$/)
  if (listMatch) {
    const type = listMatch[1] === 'image' ? 'image' : 'file'

    if (req.method === 'GET') {
      const list = [...records.values()]
        .filter((r) => r.assetType === type)
        .sort((a, b) => b.assetKey.localeCompare(a.assetKey))
        .map(toEntry)
      return send(200, list)
    }

    if (req.method === 'POST') {
      const { fileName, contentType } = JSON.parse((await readBody(req)).toString('utf8') || '{}')
      let ext
      if (type === 'image') {
        ext = EXT[String(contentType).toLowerCase()]
        if (!ext) return send(400, `Unsupported image type : ${contentType} (${fileName})`)
      } else {
        const dot = String(fileName).lastIndexOf('.')
        const found = dot < 0 ? '' : String(fileName).slice(dot).toLowerCase()
        ext = /^\.[a-z0-9]{1,8}$/i.test(found) ? found : ''
      }
      const key = `${uuid7()}${ext}`
      return send(200, {
        assetTempKey: key,
        assetUploadURL: `${SELF}/__upload/${type}/${key}`,
        assetUploadUrlValidFor: 60,
      })
    }
  }

  // ---- 업로드(프리사인 URL 흉내) ----
  const uploadMatch = path.match(/^\/__upload\/(image|file)\/(.+)$/)
  if (uploadMatch && req.method === 'PUT') {
    const type = uploadMatch[1]
    const key = decodeURIComponent(uploadMatch[2])
    objects.set(`${prefixFor(type, true)}${key}`, {
      body: await readBody(req),
      contentType: req.headers['content-type'] || 'application/octet-stream',
    })
    res.writeHead(200, { ...cors, ETag: '"x"' })
    return res.end()
  }

  // ---- 관리: 확정 / 이름 바꾸기 / 삭제 ----
  const oneMatch = path.match(/^\/api\/management\/v0\/(image|asset)\/(.+)$/)
  if (oneMatch) {
    const type = oneMatch[1] === 'image' ? 'image' : 'file'
    const id = decodeURIComponent(oneMatch[2])
    if (!ID_SHAPE.test(id)) return send(400, 'Invalid asset ID')
    const permKey = `${prefixFor(type, false)}${id}`
    const recordId = `${type}#${permKey}`

    if (req.method === 'POST') {
      const { assetName } = JSON.parse((await readBody(req)).toString('utf8') || '{}')
      const tempKey = `${prefixFor(type, true)}${id}`
      const temp = objects.get(tempKey)
      if (!temp) return send(404, 'No uploaded file was found for this asset ID')

      if (type === 'image') {
        let thumb
        try {
          const p = sharp(temp.body, { failOn: 'none' }).resize({ width: 480, withoutEnlargement: true })
          thumb =
            temp.contentType === 'image/webp'
              ? await p.webp({ quality: 78, effort: 5 }).toBuffer()
              : temp.contentType === 'image/png'
                ? await p.png({ quality: 80, compressionLevel: 9, palette: true }).toBuffer()
                : await p.jpeg({ quality: 80, mozjpeg: true }).toBuffer()
        } catch {
          return send(400, 'The uploaded file could not be read as an image')
        }
        objects.set(thumbKeyOf(permKey), { body: thumb, contentType: temp.contentType })
      }
      objects.set(permKey, temp)
      objects.delete(tempKey)

      const now = Date.now()
      const rec = {
        assetType: type,
        assetName: (assetName ?? '').trim().slice(0, 200) || id,
        assetKey: permKey,
        assetContentType: temp.contentType,
        size: temp.body.length,
        created: now,
        lastModified: now,
      }
      records.set(recordId, rec)
      return send(200, toEntry(rec))
    }

    if (req.method === 'PATCH') {
      const { assetName } = JSON.parse((await readBody(req)).toString('utf8') || '{}')
      const next = String(assetName ?? '').trim().slice(0, 200)
      if (next.length === 0) return send(400, 'The name has to be between 1 and 200 characters')
      const rec = records.get(recordId)
      if (!rec) return send(404, 'No asset was found for this asset ID')
      const updated = { ...rec, assetName: next, lastModified: Date.now() }
      records.set(recordId, updated)
      return send(200, toEntry(updated))
    }

    if (req.method === 'DELETE') {
      if (!objects.has(permKey)) return send(404, 'No asset was found for this asset ID')
      objects.delete(permKey)
      if (type === 'image') objects.delete(thumbKeyOf(permKey))
      records.delete(recordId)
      return send(200, { assetKey: permKey, assetThumbnailKey: type === 'image' ? thumbKeyOf(permKey) : '' })
    }
  }

  // ---- 시험용 들여다보기 ----
  if (path === '/__state')
    return send(200, { config, homeConfig, socialConfig, examplesConfig, glossaryConfig, keys: [...objects.keys()].sort(), records: [...records.values()], calls })
  if (path === '/__reset') {
    objects.clear()
    records.clear()
    config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
    homeConfig = emptyHome()
    socialConfig = { ...EMPTY_SOCIAL }
    examplesConfig = JSON.parse(JSON.stringify(EMPTY_EXAMPLES))
    glossaryConfig = JSON.parse(JSON.stringify(EMPTY_GLOSSARY))
    calls.length = 0
    return send(200, 'ok')
  }

  // ---- 자산 서빙 (CloudFront 자리) ----
  const stored = objects.get(path.replace(/^\/+/, ''))
  if (stored && req.method === 'GET') {
    res.writeHead(200, { ...cors, 'Content-Type': stored.contentType, 'Content-Length': stored.body.length })
    return res.end(stored.body)
  }

  // 예전 설정이 가리키는 파일들(awards/...)은 public 폴더에서 그대로 내줍니다.
  if (req.method === 'GET' && PUBLIC_DIR) {
    try {
      const file = join(PUBLIC_DIR, path.replace(/^\/+/, ''))
      if (file.startsWith(PUBLIC_DIR)) {
        const body = readFileSync(file)
        const ext = file.slice(file.lastIndexOf('.')).toLowerCase()
        const type =
          { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[ext] ??
          'application/octet-stream'
        res.writeHead(200, { ...cors, 'Content-Type': type, 'Content-Length': body.length })
        return res.end(body)
      }
    } catch {
      /* 없으면 404 */
    }
  }

  /*
   * 실제 배포된 이미지를 그대로 써서 재어 보기 위한 통로 (UPSTREAM 을 주면 켜집니다).
   * 메모리에 없는 images/... 요청은 CloudFront 에서 받아 와 그대로 넘겨 줍니다.
   */
  if (req.method === 'GET' && UPSTREAM && /^\/images\//.test(path)) {
    const upstream = await fetch(`${UPSTREAM}${path}`)
    if (upstream.ok) {
      const body = Buffer.from(await upstream.arrayBuffer())
      res.writeHead(200, {
        ...cors,
        'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': 'public, max-age=3600',
      })
      return res.end(body)
    }
  }

  /*
   * 예전 설정이 가리키는 사진들(awards/...)은 이 저장소에서 이미 지워졌습니다 (동적 업로드로 옮겨 감).
   * 시험에서는 화면이 사진을 실제로 그리는지만 보면 되므로, 자리 채움 그림을 만들어 줍니다.
   * 원본과 비슷한 2400px 로 만듭니다 (확대 보기가 축소본이 아닌 원본을 쓰는지 보는 검사가 있습니다).
   * 실제 배포에서는 이 경로들이 버킷에 있어야 합니다.
   */
  if (req.method === 'GET' && /^\/awards\/.+\.(png|jpe?g|webp)$/i.test(path)) {
    const body = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: { r: 200, g: 205, b: 215 } } })
      .png()
      .toBuffer()
    res.writeHead(200, { ...cors, 'Content-Type': 'image/png', 'Content-Length': body.length })
    return res.end(body)
  }

  send(404, 'not found')
}).listen(PORT, () => console.log(`fake api on :${PORT}`))
