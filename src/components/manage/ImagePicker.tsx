import { useEffect } from 'react'
import Icon from '../Icon'
import type { AssetLibrary } from '../../hooks/useAssetLibrary'
import styles from './ImagePicker.module.css'

interface ImagePickerProps {
  library: AssetLibrary
  /** The key currently chosen, so the picker can mark it. */
  selectedKey: string
  onSelect: (imageKey: string) => void
  onClose: () => void
  title: string
}

/** Pick one of the uploaded images. Shows thumbnails, so choosing is by sight rather than by key. */
function ImagePicker({ library, selectedKey, onSelect, onClose, title }: ImagePickerProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className={styles.panel}>
        <div className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
          <button type="button" className={styles.close} aria-label="닫기" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>

        {library.loading && <p className={styles.status}>이미지 목록을 불러오는 중입니다…</p>}
        {library.error && <p className={styles.error}>{library.error}</p>}
        {!library.loading && library.assets.length === 0 && (
          <p className={styles.status}>
            올린 이미지가 없습니다. 아래 ‘이미지’ 칸에서 먼저 올려 주세요.
          </p>
        )}

        <div className={styles.grid}>
          {library.assets.map((image) => {
            const selected = image.assetKey === selectedKey
            return (
              <button
                key={image.assetKey}
                type="button"
                className={selected ? styles.itemSelected : styles.item}
                aria-pressed={selected}
                onClick={() => {
                  onSelect(image.assetKey)
                  onClose()
                }}
              >
                <img className={styles.thumb} src={image.assetThumbnailURL} alt="" loading="lazy" />
                {/* 이름으로 고를 수 있게 되었으므로 키가 아니라 이름을 보여 줍니다. */}
                <span className={styles.itemName} title={image.assetKey}>{image.assetName}</span>
                {selected && <Icon name="check_circle" className={styles.selectedMark} />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default ImagePicker
