import { useCallback, useState } from 'react'

/**
 * 팝업 레이어에 올릴 팝업들의 열림/닫힘을 한곳에서 관리합니다.
 *
 * 팝업마다 상태를 따로 들고 있으면 "지금 열려 있는 팝업이 하나라도 있는가"를
 * 바깥에서 알 수 없어 어두운 배경을 걷어낼 시점을 정할 수 없습니다.
 * 그래서 상태를 이 훅으로 끌어올리고, 팝업 자체는 화면만 그리도록 했습니다.
 */

/** '오늘 하루 보지 않기' 저장 키. 팝업마다 따로 둬야 서로 영향을 주지 않습니다. */
const storageKey = (id: string) => `urimalPopupHideUntil:${id}`

/** localStorage 접근은 사생활 보호 모드 등에서 실패할 수 있어 감싸 둡니다. */
function hiddenForToday(id: string, today: string): boolean {
  try {
    return localStorage.getItem(storageKey(id)) === today
  } catch {
    return false
  }
}

function rememberHiddenForToday(id: string, today: string) {
  try {
    localStorage.setItem(storageKey(id), today)
  } catch {
    // 저장할 수 없으면 이번 방문 동안만 닫힌 상태로 둡니다.
  }
}

export interface PopupsState {
  /** 해당 팝업이 지금 보여야 하는지. */
  isOpen: (id: string) => boolean
  /** 열려 있는 팝업이 하나라도 있는지. 레이어를 그릴지 판단하는 기준입니다. */
  anyOpen: boolean
  /** 팝업 하나만 닫습니다. */
  close: (id: string) => void
  /** 열려 있는 팝업을 모두 닫습니다 (배경 클릭·Esc). */
  closeAll: () => void
  /** 팝업 하나를 닫고, 오늘 하루 다시 열리지 않도록 기억합니다. */
  hideToday: (id: string) => void
}

/**
 * @param ids 레이어에 올릴 팝업 식별자들. 순서가 화면에 놓이는 순서가 됩니다.
 */
export function usePopups(ids: readonly string[]): PopupsState {
  // 첫 렌더에서 '오늘 하루 보지 않기'로 숨긴 팝업을 제외하고 시작합니다.
  const [openIds, setOpenIds] = useState<Set<string>>(() => {
    const today = new Date().toDateString()
    return new Set(ids.filter((id) => !hiddenForToday(id, today)))
  })

  const close = useCallback((id: string) => {
    setOpenIds((current) => {
      if (!current.has(id)) return current
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }, [])

  const closeAll = useCallback(() => {
    setOpenIds((current) => (current.size === 0 ? current : new Set()))
  }, [])

  const hideToday = useCallback(
    (id: string) => {
      rememberHiddenForToday(id, new Date().toDateString())
      close(id)
    },
    [close],
  )

  return {
    isOpen: (id: string) => openIds.has(id),
    anyOpen: openIds.size > 0,
    close,
    closeAll,
    hideToday,
  }
}
