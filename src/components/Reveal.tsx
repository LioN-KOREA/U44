import type { ElementType, ReactNode } from 'react'
import { useReveal } from '../hooks/useReveal'
import styles from './Reveal.module.css'

interface RevealProps {
  children: ReactNode
  className?: string
  /** 감쌀 태그. 기본은 div 이며 section/li 등으로 바꿔 쓸 수 있습니다. */
  as?: ElementType
  /** 처음부터 보이게 할지 여부 (원본의 `reveal visible` 조합). */
  immediate?: boolean
}

/** 스크롤에 맞춰 서서히 나타나는 래퍼. 원본 모든 페이지의 `.reveal` 대체품입니다. */
function Reveal({ children, className, as: Tag = 'div', immediate = false }: RevealProps) {
  const { ref, visible } = useReveal<HTMLElement>()
  const shown = immediate || visible

  return (
    <Tag
      ref={ref}
      className={[styles.reveal, shown && styles.visible, className].filter(Boolean).join(' ')}
    >
      {children}
    </Tag>
  )
}

export default Reveal
