/**
 * Material Symbols 아이콘. 원본에서 쓰던
 * `<span class="material-symbols-outlined">name</span>` 을 감쌉니다.
 *
 * 리거처 이름은 본문 글자로 넣지 않고 data-icon 속성에 담아, CSS 의 ::before 가 그립니다
 * (tokens.css). 본문 글자로 넣으면 검색 엔진이 'check_circle 본인 추천 가능 …' 처럼 아이콘 이름을
 * 문장의 일부로 읽어 갑니다. aria-hidden 은 화면 읽기 프로그램만 막을 뿐 검색 엔진은 막지 못합니다.
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
      data-icon={name}
    />
  )
}

export default Icon
