import { useCallback, useMemo, useState } from 'react'

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
  /*
   * 열린 목록이 아니라 '닫은 목록' 을 들고 있습니다.
   *
   * 어떤 팝업을 띄울지는 설정에서 오고, 설정은 첫 렌더보다 늦게 도착합니다. 열린 목록을 상태로
   * 두면 그 첫 렌더(아직 아무 팝업도 없는 시점)의 값이 그대로 굳어, 설정이 도착해도 팝업이
   * 영영 뜨지 않습니다. 닫은 목록만 기억하고 열린 목록은 그때그때 계산하면, 목록이 바뀌어도
   * 사용자가 닫아 둔 것은 닫힌 채로 남습니다.
   */
  const [closedIds, setClosedIds] = useState<ReadonlySet<string>>(() => new Set())

  // '오늘 하루 보지 않기' 는 저장소에 있습니다. 목록이 바뀔 때만 다시 읽습니다.
  const hiddenIds = useMemo(() => {
    const today = new Date().toDateString()
    return new Set(ids.filter((id) => hiddenForToday(id, today)))
  }, [ids])

  const openIds = useMemo(
    () => ids.filter((id) => !closedIds.has(id) && !hiddenIds.has(id)),
    [ids, closedIds, hiddenIds],
  )

  const close = useCallback((id: string) => {
    setClosedIds((current) => {
      if (current.has(id)) return current
      const next = new Set(current)
      next.add(id)
      return next
    })
  }, [])

  // 배경을 누르거나 Esc 를 누르면 지금 보이는 것을 모두 닫습니다.
  const closeAll = useCallback(() => {
    setClosedIds((current) => {
      const next = new Set(current)
      for (const id of ids) next.add(id)
      return next
    })
  }, [ids])

  const hideToday = useCallback(
    (id: string) => {
      rememberHiddenForToday(id, new Date().toDateString())
      close(id)
    },
    [close],
  )

  return {
    isOpen: (id: string) => openIds.includes(id),
    anyOpen: openIds.length > 0,
    close,
    closeAll,
    hideToday,
  }
}
