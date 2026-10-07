import { useState } from 'react'
import Icon from './Icon'
import { useThumbnail } from '../hooks/useThumbnail'
import styles from './SafeImage.module.css'

interface SafeImageProps {
  src: string | null
  alt: string
  className?: string
  imageClassName?: string
  /** 이미지를 못 불러왔을 때 자리표시자에 적을 문구. */
  fallbackText?: string
  /**
   * 이 이미지가 화면에서 차지하는 너비. 브라우저가 srcset 중 하나를 고르는 기준입니다.
   * 기본값은 목록 카드 기준입니다.
   */
  sizes?: string
  /**
   * 축소본을 쓰지 않고 원본을 그대로 불러올지 여부.
   * 확대 보기처럼 화질이 중요한 곳에서만 켭니다.
   */
  fullResolution?: boolean
  /** 첫 화면에 바로 보이는 이미지라면 지연 로딩을 끕니다. */
  eager?: boolean
}

/**
 * 이미지를 그리되,
 *  - 목록/격자에서는 미리 만들어 둔 축소본(_tn/_md)을 쓰고,
 *  - 파일이 없으면 자리표시자로 대체합니다.
 *
 * 축소본이 아직 없으면(생성 스크립트를 돌리기 전) 원본으로 자동 후퇴합니다.
 */
function SafeImage({
  src,
  alt,
  className,
  imageClassName,
  fallbackText,
  sizes = '(min-width: 768px) 320px, 90vw',
  fullResolution = false,
  eager = false,
}: SafeImageProps) {
  // 'derivative' -> 축소본 시도, 'original' -> 원본으로 후퇴, 'failed' -> 자리표시자
  const [stage, setStage] = useState<'derivative' | 'original' | 'failed'>(
    fullResolution ? 'original' : 'derivative',
  )
  const sources = useThumbnail(src)

  if (!src || stage === 'failed') {
    return (
      <div className={[styles.wrap, className].filter(Boolean).join(' ')}>
        <div className={styles.fallback} role="img" aria-label={alt}>
          <Icon name="image_not_supported" className={styles.fallbackIcon} />
          <span className={styles.fallbackText}>{fallbackText ?? alt}</span>
        </div>
      </div>
    )
  }

  const useDerivative = stage === 'derivative' && sources !== null && sources.srcSet !== ''
  const imgClass = [styles.image, imageClassName].filter(Boolean).join(' ')

  const img = (
    <img
      className={imgClass}
      src={useDerivative ? sources.src : src}
      srcSet={useDerivative ? sources.srcSet : undefined}
      sizes={useDerivative ? sizes : undefined}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      // 축소본이 없으면 원본으로, 원본도 없으면 자리표시자로 단계적으로 내려갑니다.
      onError={() => setStage((current) => (current === 'derivative' ? 'original' : 'failed'))}
    />
  )

  return (
    <div className={[styles.wrap, className].filter(Boolean).join(' ')}>
      {/*
        webp 후보가 있을 때만 <picture> 로 감쌉니다. srcSet 이 빈 <source> 는 그리지 않습니다
        (백엔드에 올린 이미지는 축소본이 원본과 같은 형식이라 webp 후보가 없습니다).
      */}
      {useDerivative && sources.webpSrcSet !== '' ? (
        <picture>
          <source type="image/webp" srcSet={sources.webpSrcSet} sizes={sizes} />
          {img}
        </picture>
      ) : (
        img
      )}
    </div>
  )
}

export default SafeImage
