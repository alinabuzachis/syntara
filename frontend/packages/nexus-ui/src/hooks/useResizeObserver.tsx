import { useEffect } from 'react'

export function useResizeObserver(
  ref: React.RefObject<HTMLElement | null>,
  callback: (entry: ResizeObserverEntry) => void
) {
  useEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        callback(entry)
      }
    })
    observer.observe(ref.current)
    return () => {
      observer.disconnect()
    }
  }, [ref, callback])
}
