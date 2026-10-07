/**
 * Material Symbols 아이콘. 원본에서 쓰던
 * `<span class="material-symbols-outlined">name</span>` 을 그대로 감쌉니다.
 */
interface IconProps {
  /** 리거처 이름 (예: 'menu', 'check_circle'). */
  name: string
  className?: string
  /** 채워진(FILL 1) 형태로 그릴지 여부. */
  filled?: boolean
}

function Icon({ name, className, filled = false }: IconProps) {
  return (
    <span
      aria-hidden="true"
      className={['material-symbols-outlined', className].filter(Boolean).join(' ')}
      style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
    >
      {name}
    </span>
  )
}

export default Icon
