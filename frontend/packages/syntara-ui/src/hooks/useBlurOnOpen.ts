import { useLayoutEffect, useRef } from 'react'

/**
 * Blur the currently focused element when `isOpen` transitions to true,
 * or when the component mounts with `isOpen` already true (e.g. keyed remounts).
 *
 * PatternFly's Modal sets aria-hidden on the app root in a layout effect.
 * We use useLayoutEffect here so the blur fires synchronously before PF's
 * aria-hidden logic runs, preventing the browser warning:
 * "Blocked aria-hidden on an element because its descendant retained focus."
 */
export function useBlurOnOpen(isOpen: boolean): void {
  const hasFiredRef = useRef(false)

  useLayoutEffect(() => {
    if (isOpen && !hasFiredRef.current) {
      ;(document.activeElement as HTMLElement | null)?.blur?.()
      hasFiredRef.current = true
    }
    if (!isOpen) {
      hasFiredRef.current = false
    }
  }, [isOpen])
}
