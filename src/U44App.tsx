import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import Footer from './components/Footer'
import Header from './components/Header'
import ExemplaryCasesPage from './pages/ExemplaryCasesPage'
import GlossaryPage from './pages/GlossaryPage'
import HomePage from './pages/HomePage'
import IntroductionPage from './pages/IntroductionPage'
import ManagePage from './pages/ManagePage'
import NominationPage from './pages/NominationPage'
import WinnersPage from './pages/WinnersPage'
import { apiBaseUrl } from './data/config'
import { paths, sectionForPath } from './navigation'
import styles from './U44App.module.css'

/** 다른 화면으로 옮겨 가면 맨 위에서 시작합니다. (같은 화면 안의 #앵커 이동은 건드리지 않습니다) */
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname])
  return null
}

/**
 * 예전 주소(`/#/winners/2026-08`)로 들어와도 새 주소(`/winners/2026-08`)로 옮겨 줍니다.
 * 이미 공유되거나 즐겨찾기된 링크가 끊기지 않게 하기 위함입니다.
 * `#sec-5` 같은 본문 앵커는 경로가 아니므로 그대로 둡니다.
 */
function LegacyHashRedirect() {
  const { hash } = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    if (!hash.startsWith('#/')) return
    const path = hash.slice(1)
    navigate(path === '/home' ? paths.home : path, { replace: true })
  }, [hash, navigate])
  return null
}

function U44App() {
  const { pathname } = useLocation()
  const section = sectionForPath(pathname);
  /*
   * Temporary; will be controlled by an auth context before going into production.
   * In a development build it can be flipped from the console (then reload):
   *   localStorage.setItem('u44admin', '1')
   * import.meta.env.DEV is false in a production build, so this is not a way in on the live site.
   */
  const [isAdminAuthorized, _setIsAdminAuthorized] = useState<boolean>(
    //() => import.meta.env.DEV && localStorage.getItem('u44admin') === '1',
    true
  )
/*
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const onStorage = () => setIsAdminAuthorized(localStorage.getItem('u44admin') === '1')
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
*/
  /*
   * 관리 화면은 두 조건이 모두 맞을 때만 존재합니다. 숨기는 것이 아니라 경로 자체를 만들지
   * 않으므로, 주소를 직접 쳐도 아래의 '*' 규칙에 걸려 홈으로 갑니다.
   */
  const isManageEnabled = isAdminAuthorized && apiBaseUrl !== ''

  useEffect(() => {
    document.title = section.title
  }, [section.title])

  return (
    <div className={styles.app}>
      <ScrollToTop />
      <LegacyHashRedirect />
      <Header />

      <Routes>
        <Route index element={<HomePage />} />
        <Route path={paths.introduction} element={<IntroductionPage />} />
        <Route path={paths.glossary} element={<GlossaryPage />} />
        {/*
          목록과 상세를 한 경로(선택적 매개변수)로 묶어, 오가는 동안 같은 화면이 유지되게 합니다.
          그래서 목록의 검색·정렬 상태가 상세에 다녀와도 남아 있습니다.
        */}
        <Route path={`${paths.examples}/:caseId?`} element={<ExemplaryCasesPage />} />
        <Route path={`${paths.winners}/:ceremonyId?`} element={<WinnersPage />} />
        <Route path={paths.nomination} element={<NominationPage />} />
        {isManageEnabled && <Route path={paths.manage} element={<ManagePage />} />}
        {/* 알 수 없는 주소는 홈으로 보냅니다. */}
        <Route path="*" element={<Navigate to={paths.home} replace />} />
      </Routes>

      <Footer tone={section.footerTone} />
    </div>
  )
}

export default U44App
