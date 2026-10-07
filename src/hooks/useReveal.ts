import { useEffect, useRef, useState } from 'react'

/**
 * Move the scroll-revealing effect to a separate hook.
 * (corresponds to the original's `.reveal` / IntersectionObserver scroll effect)
 * If the element that contains the ref that is returned becomes visible, 
 * the state "visible" becomes true, and stays true afterwards.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(threshold = 0.1) {
  const ref = useRef<T | null>(null)
  // Graceful degradation:
  // if the observer is unavailable, the element is visible from the start.
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    const element = ref.current
    if (!element) return

    if (typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true)
            observer.disconnect()
          }
        }
      },
      { threshold },
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [threshold])

  return { ref, visible }
}
