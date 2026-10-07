import SafeImage from './SafeImage'

export interface ImageCardProps {
  /** 원본 이미지 경로. 표시는 미리 만들어 둔 축소본으로 합니다. */
  rawImagePath: string
  /** 대체 텍스트. */
  altImagePath: string
  className?: string
  imageClassName?: string
  /** 화면에서 차지하는 너비(브라우저가 축소본을 고르는 기준). */
  sizes?: string
  /** 확대 보기처럼 원본 화질이 필요한 곳에서 켭니다. */
  fullResolution?: boolean
  eager?: boolean
}

/**
 * 축소본을 써서 이미지를 그리는 카드.
 *
 * 예전 구현은 원본을 받아 캔버스로 줄였는데, 그러면 원본을 통째로 내려받고
 * 디코딩한 뒤에야 줄이게 되어 느린 부분이 그대로 남습니다. 지금은
 * `scripts/generate-thumbnails.mjs` 가 미리 만들어 둔 _tn/_md 파일을
 * srcset 으로 넘겨 브라우저가 알아서 고르게 합니다.
 */
export function ThumbnailedImageCard({
  rawImagePath,
  altImagePath,
  className,
  imageClassName,
  sizes,
  fullResolution,
  eager,
}: ImageCardProps) {
  return (
    <SafeImage
      src={rawImagePath}
      alt={altImagePath}
      className={className}
      imageClassName={imageClassName}
      sizes={sizes}
      fullResolution={fullResolution}
      eager={eager}
    />
  )
}

export default ThumbnailedImageCard
