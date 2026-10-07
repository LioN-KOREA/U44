import { useMemo } from 'react'

/**
 * This hook computes the URLs for "pre-generated thumbnails" 
 * that are generated for a large image.
 *
 * The previous method (where the images were cropped on the browser-side with a canvas)
 * required downloading the original & decoding the originals (which is the slow part),
 * add added the costs of encoding on top of that.
 * 
 * In order to address this issue, we pre-generate the thumbnails 
 * (either on compile time for the static resources, or by the backend for the dynamic resources),
 * and compute the addresses for those thumbnails according to the rules.
 * 
 * No network requests, no state changes.
 */

/** The values MUST be the same as the thumbnail generation script. */
export const VARIANTS = [
  { suffix: '_tn', width: 480 },
  { suffix: '_md', width: 1440 },
] as const

const SUFFIX_PATTERN = /(_tn|_md)$/

/*
 * 백엔드에 올린 이미지의 프리픽스.
 *
 * 업로드를 확정할 때 백엔드가 같은 이름의 480px 축소본을 thumbnails 프리픽스 아래에 만들어 둡니다
 * (backend/src/u44be/assets/U44AssetsManager.ts). 설정에는 원본 주소만 들어 있는 자리가 있어서
 * (수상자 사진, 대표 사진), 그 축소본 주소는 여기서 같은 규칙으로 만들어 씁니다.
 * 한쪽 프리픽스를 바꾸면 이쪽도 같이 바꿔야 합니다.
 */
const MANAGED_IMAGES_PATH = '/images/'
const MANAGED_THUMBNAILS_PATH = '/images/thumbnails/'

/** 백엔드가 만드는 축소본의 너비. U44AssetsManager 의 THUMBNAIL_WIDTH 와 같아야 합니다. */
const MANAGED_THUMBNAIL_WIDTH = 480

/**
 * 원본의 너비로 적어 두는 값.
 *
 * 원본의 실제 크기는 브라우저가 내려받기 전에는 알 수 없습니다. 이 값은 '축소본보다 큰 후보'
 * 라는 뜻만 있으면 되므로, 축소본으로 충분한 자리에서는 브라우저가 축소본을 고르고 더 큰 자리에서만
 * 원본을 고릅니다. 실제 원본이 이보다 작아도, 그 자리에서는 어차피 원본이 가장 큰 후보입니다.
 */
const ASSUMED_FULL_WIDTH = 4000

/**
 * 올린 이미지 주소에서 축소본 주소를 만듭니다. 올린 이미지가 아니면 null.
 *
 * 이미 thumbnails 아래를 가리키는 주소(현장 사진처럼 설정에 축소본이 따로 들어 있는 경우)는
 * 건드리지 않습니다.
 */
function managedThumbnail(source: string): string | null {
  const at = source.lastIndexOf(MANAGED_IMAGES_PATH)
  if (at === -1) return null
  const name = source.slice(at + MANAGED_IMAGES_PATH.length)
  if (name === '' || name.includes('/')) return null
  return `${source.slice(0, at)}${MANAGED_THUMBNAILS_PATH}${name}`
}

export interface ThumbnailSources {
  /** <img src> 로 쓸 기본 축소본 (가장 작은 규격, 원본과 같은 형식). */
  src: string
  /** 화면 너비에 맞춰 브라우저가 고르도록 하는 후보 목록. */
  srcSet: string
  /** WebP 를 지원하면 우선 쓰이는 후보 목록. */
  webpSrcSet: string
  /** 확대 보기에서 쓸 원본 주소. */
  full: string
}

/** 경로를 디렉터리/이름/확장자로 쪼갭니다. 이미 붙어 있는 _tn·_md 는 떼어 냅니다. */
function splitPath(source: string) {
  const queryIndex = source.search(/[?#]/)
  const clean = queryIndex === -1 ? source : source.slice(0, queryIndex)
  const slash = clean.lastIndexOf('/')
  const dir = slash === -1 ? '' : clean.slice(0, slash + 1)
  const file = clean.slice(slash + 1)
  const dot = file.lastIndexOf('.')
  const ext = dot === -1 ? '' : file.slice(dot)
  const stem = dot === -1 ? file : file.slice(0, dot)
  // 이미 축소본 경로가 들어와도 같은 결과가 나오도록 접미사를 정규화합니다.
  return { dir, stem: stem.replace(SUFFIX_PATTERN, ''), ext: ext.toLowerCase() }
}

/** 축소본을 만들어 둔 형식만 대상으로 합니다. */
function hasDerivatives(ext: string): boolean {
  return ext === '.jpg' || ext === '.jpeg' || ext === '.png'
}

function isExternal(source: string): boolean {
  return /^(https?:|data:|blob:)/.test(source)
}

/**
 * @param source 원본(또는 축소본) 경로. 둘 중 무엇을 넘겨도 같은 결과가 나옵니다.
 * @param fullSource 확대 보기용 원본을 따로 지정하고 싶을 때.
 */
export function useThumbnail(
  source: string | null | undefined,
  fullSource?: string | null,
): ThumbnailSources | null {
  return useMemo(() => {
    if (!source) return null

    const full = fullSource || source

    /*
     * 백엔드에 올린 이미지: 축소본과 원본을 후보로 함께 넘겨 브라우저가 고르게 합니다.
     *
     * 설정에는 수상자·대표 사진의 원본 주소만 들어 있어서, 이 처리가 없으면 220px 자리에
     * 4500px 원본을 내려받습니다 (사진 한 장이 90MB 넘게 펼쳐집니다).
     */
    const managed = managedThumbnail(source)
    if (managed) {
      return {
        src: managed,
        srcSet: `${managed} ${MANAGED_THUMBNAIL_WIDTH}w, ${full} ${ASSUMED_FULL_WIDTH}w`,
        // 백엔드 축소본은 원본과 같은 형식이라 따로 webp 후보가 없습니다.
        webpSrcSet: '',
        full,
      }
    }

    // 그 밖의 외부 주소나 축소본이 없는 형식(webp/svg 등)은 그대로 씁니다.
    if (isExternal(source)) {
      return { src: source, srcSet: '', webpSrcSet: '', full }
    }

    const { dir, stem, ext } = splitPath(source)
    if (!hasDerivatives(ext)) {
      return { src: source, srcSet: '', webpSrcSet: '', full }
    }

    const variantUrl = (suffix: string, extension: string) => `${dir}${stem}${suffix}${extension}`
    const srcSet = VARIANTS.map((v) => `${variantUrl(v.suffix, ext)} ${v.width}w`).join(', ')
    const webpSrcSet = VARIANTS.map((v) => `${variantUrl(v.suffix, '.webp')} ${v.width}w`).join(', ')

    return {
      src: variantUrl(VARIANTS[0].suffix, ext),
      srcSet,
      webpSrcSet,
      full: isExternal(full) ? full : `${dir}${splitPath(full).stem}${splitPath(full).ext}`,
    }
  }, [source, fullSource])
}
