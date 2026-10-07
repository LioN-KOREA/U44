import { useEffect, type ReactNode } from 'react'
import styles from './PopupLayer.module.css'

interface PopupLayerProps {
  /** 열려 있는 팝업이 하나라도 있는지. false 면 레이어를 아예 그리지 않습니다. */
  open: boolean
  /** 배경을 누르거나 Esc 를 눌렀을 때 (열려 있는 팝업을 모두 닫습니다). */
  onDismiss: () => void
  /** 나란히 놓을 팝업들. */
  children: ReactNode
  /** 화면 낭독기에 읽힐 레이어 이름. */
  label?: string
}

/**
 * 팝업들이 나란히 올라가는 공용 레이어.
 *
 * 어두운 배경은 이 레이어가 한 장만 깔기 때문에, 팝업을 하나씩 닫아도
 * 배경이 겹쳐 남지 않습니다. 마지막 팝업이 닫히면 레이어가 통째로 사라져
 * 화면 뒤쪽을 다시 조작할 수 있습니다.
 */
function PopupLayer({ open, onDismiss, children, label = '안내 팝업' }: PopupLayerProps) {
  // Esc 로 전체 닫기. 레이어가 열려 있는 동안에만 듣습니다.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onDismiss])

  if (!open) return null

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={(event) => {
        // 팝업 안쪽을 누른 경우는 무시하고, 배경을 눌렀을 때만 닫습니다.
        if (event.target === event.currentTarget) onDismiss()
      }}
    >
      <div
        className={styles.row}
        onClick={(event) => {
          if (event.target === event.currentTarget) onDismiss()
        }}
      >
        {children}
      </div>
    </div>
  )
}

export default PopupLayer
