import type { FooterTone } from './components/Footer'

/**
 * 사이트의 구역(메뉴)과 주소.
 *
 * 주소 해석과 이동은 React Router 가 맡고, 이 파일은 "어떤 구역이 어느 주소에 있고
 * 메뉴 이름·문서 제목·바닥글 색이 무엇인지"만 한곳에 적어 둡니다.
 * 새 메뉴를 추가할 때는 SECTIONS 와 U44App.tsx 의 <Route> 만 손보면 됩니다.
 */

export type SectionId =
  | 'home'
  | 'introduction'
  | 'glossary'
  | 'examples'
  | 'winners'
  | 'nomination'
  | 'manage'

/** 화면 이동에 쓰는 주소. 문자열을 곳곳에 직접 적지 않도록 여기서만 만듭니다. */
export const paths = {
  home: '/',
  introduction: '/introduction',
  glossary: '/glossary',
  examples: '/examples',
  exemplaryCase: (id: string) => `/examples/${encodeURIComponent(id)}`,
  winners: '/winners',
  ceremony: (id: string) => `/winners/${encodeURIComponent(id)}`,
  nomination: '/nomination',
  /** 관리 화면. 로그인한 관리자에게만, 그리고 백엔드가 설정되어 있을 때만 열립니다. */
  manage: '/manage',
} as const

export interface Section {
  id: SectionId
  /** The first segment of the section's URL path. The details page(/winners/2026-08 등) also belongs here. */
  path: string
  /** The label that is visible to the user. */
  label: string
  /** The browser title. */
  title: string
  /** The footer color tone (which used to be different per page). */
  footerTone: FooterTone
  /** Whether to show this section in the top menu bar (Recommend-a-new-journalist link shows up as a separate button). */
  inNav: boolean
}

export const SECTIONS: readonly Section[] = [
  {
    id: 'home',
    path: paths.home,
    label: '홈',
    title: '쉽고 바른 우리말 언론인상',
    footerTone: 'default',
    inNav: true,
  },
  {
    id: 'introduction',
    path: paths.introduction,
    label: '시상식 안내',
    title: '시상식 안내 - 쉽고 바른 우리말 언론인상',
    footerTone: 'muted',
    inNav: true,
  },
  {
    id: 'glossary',
    path: paths.glossary,
    label: '우리말 개선 용어',
    title: '우리말 개선 용어 - 쉽고 바른 우리말 언론인상',
    footerTone: 'muted',
    inNav: true,
  },
  {
    id: 'examples',
    path: paths.examples,
    label: '우리말 우수사례',
    title: '우리말 우수사례 | 쉽고 바른 우리말 언론인상',
    footerTone: 'container',
    inNav: true,
  },
  {
    id: 'winners',
    path: paths.winners,
    label: '우리말 수상자',
    title: '우리말 수상자 | 쉽고 바른 우리말 언론인상',
    footerTone: 'container',
    inNav: true,
  },
  {
    id: 'nomination',
    path: paths.nomination,
    label: '추천하기',
    title: '언론인 추천 - 쉽고 바른 우리말 언론인상',
    footerTone: 'low',
    inNav: false,
  },
  {
    id: 'manage',
    path: paths.manage,
    label: '관리',
    title: '관리 - 쉽고 바른 우리말 언론인상',
    footerTone: 'low',
    inNav: false,
  },
]

const HOME_SECTION = SECTIONS[0]

/** 현재 주소가 속한 구역. '/winners/2026-08' 은 winners 구역입니다. */
export function sectionForPath(pathname: string): Section {
  const first = pathname.split('/').filter(Boolean)[0]
  if (!first) return HOME_SECTION
  return SECTIONS.find((section) => section.path === `/${first}`) ?? HOME_SECTION
}
