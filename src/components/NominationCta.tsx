import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { paths } from '../navigation'
import styles from './NominationCta.module.css'

interface NominationCtaProps {
  title: string
  body: ReactNode
  buttonLabel: string
  /** 수상자 페이지에서만 쓰는 배경 발광 장식. */
  withGlow?: boolean
}

/** 홈과 수상자 페이지 하단에 반복되던 남색 추천 유도 섹션. */
function NominationCta({ title, body, buttonLabel, withGlow = false }: NominationCtaProps) {
  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.body}>{body}</p>
        <Link to={paths.nomination} className={styles.button}>
          {buttonLabel}
        </Link>
      </div>
      {withGlow && (
        <>
          <div className={styles.glowTop} />
          <div className={styles.glowBottom} />
        </>
      )}
    </section>
  )
}

export default NominationCta
