import { apiBaseUrl } from './config'
import type { RawAwardConfig } from './awards'
import type { RawHomescreenConfig } from './homescreen'
import type { RawSocialMediaConfig } from './socialMedia'

/**
 * Calls the management API uses (`/api/management/v0/...`).
 *
 * The API and the assets sit behind the same CloudFront distribution, so one base URL
 * (VITE_API_BASE_URL) covers both. With no base URL there is no backend to manage, which is why
 * the 관리 route is not mounted at all in that case.
 *
 * 모든 요청에는 로그인한 관리자의 접근 토큰이 붙습니다. 백엔드가 토큰을 직접 검증하고 권한까지
 * 확인하므로, 화면에서 무엇을 감추든 이 토큰이 없으면 아무것도 바꿀 수 없습니다.
 */

const MANAGEMENT_BASE = '/api/management/v0'

function managementUrl(path: string): string {
  return `${apiBaseUrl}${MANAGEMENT_BASE}${path}`
}

/*
 * 접근 토큰을 가져오는 함수.
 *
 * 토큰은 AuthProvider 가 메모리에 들고 있고(저장소에 두지 않습니다), 이 모듈은 리액트를 모르는
 * 평범한 모듈이라 바로 꺼내 쓸 수 없습니다. 그래서 AuthProvider 가 시작할 때 꺼내는 방법만
 * 여기에 등록해 둡니다. 만료가 가까우면 이 함수가 먼저 갱신하고 새 토큰을 돌려줍니다.
 */
type AccessTokenProvider = () => Promise<string | null>

let accessTokenProvider: AccessTokenProvider | null = null

export function setAccessTokenProvider(provider: AccessTokenProvider | null): void {
  accessTokenProvider = provider
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = accessTokenProvider ? await accessTokenProvider() : null
  if (!accessToken) {
    throw new Error('로그인이 필요합니다. 다시 로그인해 주세요.')
  }

  const response = await fetch(managementUrl(path), {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` },
  })
  const text = (await response.text()).trim()
  if (!response.ok) {
    if (response.status === 401) throw new Error('로그인이 만료되었습니다. 다시 로그인해 주세요.')
    if (response.status === 403) throw new Error('이 작업을 할 권한이 없습니다.')
    // The API answers with a plain string on failure, so it is shown as-is.
    throw new Error(text || `요청이 실패했습니다 (HTTP ${response.status})`)
  }
  return (text ? JSON.parse(text) : null) as T
}

function jsonRequest<T>(path: string, method: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/* -------------------------------------------------------------------------- */
/* 시상식 설정                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The config as stored, with image references kept as object keys.
 *
 * Deliberately not the public `/api/v0/award-info`, which rewrites keys into CloudFront URLs:
 * saving that back would store URLs and the keys would be lost.
 */
export function fetchAwardConfigForEditing(): Promise<RawAwardConfig> {
  return request<RawAwardConfig>('/award-info')
}

export function saveAwardConfig(config: RawAwardConfig): Promise<unknown> {
  return jsonRequest('/award-info', 'POST', config)
}

/* -------------------------------------------------------------------------- */
/* 홈 화면 · 누리소통망 설정                                                    */
/* -------------------------------------------------------------------------- */

/*
 * 이 둘도 시상식 설정과 같습니다: 편집용으로는 이미지 키를 그대로 둔 설정을 읽습니다.
 * 공개용 응답은 키를 CloudFront 주소로 바꾸고, 홈 화면은 빈 자리에 기본 포스터를 채워 주므로,
 * 그것을 그대로 저장하면 주소가 키 자리에 들어가고 '고르지 않음'이 실제 선택으로 굳어 버립니다.
 */

export function fetchHomescreenConfigForEditing(): Promise<RawHomescreenConfig> {
  return request<RawHomescreenConfig>('/homescreen')
}

export function saveHomescreenConfig(config: RawHomescreenConfig): Promise<unknown> {
  return jsonRequest('/homescreen', 'POST', config)
}

export function fetchSocialMediaConfigForEditing(): Promise<RawSocialMediaConfig> {
  return request<RawSocialMediaConfig>('/social-media-posts')
}

export function saveSocialMediaConfig(config: RawSocialMediaConfig): Promise<unknown> {
  return jsonRequest('/social-media-posts', 'POST', config)
}

/* -------------------------------------------------------------------------- */
/* 자산 (이미지 · 파일)                                                         */
/* -------------------------------------------------------------------------- */

export type AssetType = 'image' | 'file'

/** One stored asset. Only an image fills in the thumbnail fields. */
export interface ManagedAsset {
  assetType: AssetType
  assetName: string
  assetKey: string
  assetURL: string
  assetContentType: string
  assetThumbnailKey: string
  assetThumbnailURL: string
  size: number
  created: number
  lastModified: number
}

/** 자산 종류별 경로. 이미지와 파일이 같은 흐름을 쓰므로 경로만 갈아 끼웁니다. */
const assetPath = (type: AssetType) => (type === 'image' ? '/image' : '/asset')

/** An asset's id is the file name part of its key - what the API takes as a path parameter. */
export function assetIdOf(assetKey: string): string {
  return assetKey.slice(assetKey.lastIndexOf('/') + 1)
}

export function listAssets(type: AssetType): Promise<ManagedAsset[]> {
  return request<ManagedAsset[]>(assetPath(type))
}

interface UploadTicket {
  assetTempKey: string
  assetUploadURL: string
  assetUploadUrlValidFor: number
}

/**
 * Upload one asset: ask for a URL, PUT the bytes straight to S3, then confirm.
 *
 * The file never passes through the API. Only the confirm step makes it permanent - it creates the
 * record (and, for an image, the thumbnail) - so a failure part way through leaves nothing behind
 * that the app can see; S3 removes the unconfirmed upload after a day.
 *
 * The display name travels with the confirm call, because that is where the record is written.
 */
export async function uploadAsset(type: AssetType, file: File, assetName?: string): Promise<ManagedAsset> {
  const contentType = file.type
  const ticket = await jsonRequest<UploadTicket>(assetPath(type), 'POST', {
    fileName: file.name,
    contentType,
  })

  const uploaded = await fetch(ticket.assetUploadURL, {
    method: 'PUT',
    // Must be exactly the type that was signed, or S3 rejects it as SignatureDoesNotMatch.
    headers: { 'Content-Type': contentType },
    body: file,
  })
  if (!uploaded.ok) {
    throw new Error(`파일을 올리지 못했습니다 (HTTP ${uploaded.status})`)
  }

  return await jsonRequest<ManagedAsset>(
    `${assetPath(type)}/${encodeURIComponent(ticket.assetTempKey)}`,
    'POST',
    { assetName: assetName ?? file.name },
  )
}

/** Rename an asset. Only the label changes; the key stays, so config references keep working. */
export function renameAsset(type: AssetType, assetKey: string, assetName: string): Promise<ManagedAsset> {
  return jsonRequest<ManagedAsset>(
    `${assetPath(type)}/${encodeURIComponent(assetIdOf(assetKey))}`,
    'PATCH',
    { assetName },
  )
}

/** Delete an asset (and, for an image, its thumbnail). */
export function deleteAsset(type: AssetType, assetKey: string): Promise<unknown> {
  return request(`${assetPath(type)}/${encodeURIComponent(assetIdOf(assetKey))}`, { method: 'DELETE' })
}

/* -------------------------------------------------------------------------- */
/* 날짜 입력 변환                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The config stores the ceremony time as epoch milliseconds, while <input type="datetime-local">
 * works in plain local text. Both directions are pinned to Seoul time so that the value an editor
 * types is the value the site shows, whatever timezone the editor's computer is in.
 */
const SEOUL_UTC_OFFSET = '+09:00'

export function epochToDateTimeInput(epochMs: number | string | undefined | null): string {
  if (!epochMs) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(typeof epochMs === 'string' ? Date.parse(epochMs) : epochMs)
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}`
}

export function dateTimeInputToEpoch(value: string): number | undefined {
  if (!value) return undefined
  const epochMs = Date.parse(`${value}:00${SEOUL_UTC_OFFSET}`)
  return Number.isFinite(epochMs) ? epochMs : undefined
}

/** The year and month a ceremony time falls in, in Seoul. */
export function seoulYearMonth(epochMs: number): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric',
  }).formatToParts(epochMs)
  const pick = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value)
  return { year: pick('year'), month: pick('month') }
}

/** 파일 크기를 사람이 읽기 좋게 ('1.2 MB'). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}
