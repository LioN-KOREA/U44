import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import Icon from './Icon'
import { SECTIONS, paths } from '../navigation'
import styles from './Header.module.css'

const NAV_SECTIONS = SECTIONS.filter((section) => section.inNav)

/** 모든 페이지가 공유하는 상단 내비게이션. 원본에서는 파일마다 복사돼 있던 부분입니다. */
function Header() {
  const { pathname } = useLocation()

  /*
   * 모바일 메뉴는 '어느 주소에서 열렸는지'로 들고 있습니다.
   * 이렇게 두면 화면이 바뀌는 순간(뒤로 가기 포함) 별도 처리 없이 저절로 닫힙니다.
   */
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null)
  const menuOpen = menuOpenFor === pathname
  const [scrolled, setScrolled] = useState(() => window.scrollY > 50)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // 원본 nomination.html 헤더에는 '추천하기' 단추가 없습니다.
  const showCta = pathname !== paths.nomination

  return (
    <header className={[styles.header, scrolled && styles.scrolled].filter(Boolean).join(' ')}>
      <div className={styles.bar}>
        <Link to={paths.home} className={styles.brand}>
          쉽고 바른 우리말 언론인상
        </Link>

        <nav className={styles.nav}>
          {NAV_SECTIONS.map((section) => (
            <NavLink
              key={section.id}
              to={section.path}
              // 홈('/')은 모든 주소의 앞부분이라, 정확히 일치할 때만 선택된 것으로 칩니다.
              end={section.path === paths.home}
              className={({ isActive }) => (isActive ? styles.navLinkActive : styles.navLink)}
            >
              {section.label}
            </NavLink>
          ))}
          {showCta && (
            <Link to={paths.nomination} className={styles.ctaButton}>
              추천하기
            </Link>
          )}
        </nav>

        <button
          type="button"
          className={styles.menuButton}
          aria-label="메뉴 열기"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpenFor((open) => (open === pathname ? null : pathname))}
        >
          <Icon name="menu" />
        </button>
      </div>

      {menuOpen && (
        <div className={styles.mobileMenu}>
          {NAV_SECTIONS.map((section) => (
            <NavLink
              key={section.id}
              to={section.path}
              end={section.path === paths.home}
              className={({ isActive }) => (isActive ? styles.mobileLinkActive : styles.mobileLink)}
            >
              {section.label}
            </NavLink>
          ))}
          {showCta && (
            <Link to={paths.nomination} className={styles.mobileLink}>
              추천하기
            </Link>
          )}
        </div>
      )}
    </header>
  )
}

export default Header
