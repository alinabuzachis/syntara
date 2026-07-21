import { useRouter } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

/**
 * Moves focus to the given element on client-side route changes.
 *
 * SPAs don't trigger a full page load, so the browser never resets focus.
 * This hook subscribes to TanStack Router's `onResolved` event and
 * programmatically focuses the main content area when the pathname changes,
 * mirroring native browser behavior on traditional page navigations.
 *
 * Only triggers on pathname changes — query param or hash changes are ignored.
 */
export function useRouteChangeFocus(ref: React.RefObject<HTMLElement | null>) {
  const router = useRouter()
  const previousPathRef = useRef<string | null>(null)

  useEffect(() => {
    let animationFrameId: number | undefined

    const unsubscribe = router.subscribe('onResolved', ({ toLocation }) => {
      const currentPath = toLocation.pathname

      if (previousPathRef.current === null) {
        previousPathRef.current = currentPath
        return
      }

      if (previousPathRef.current !== currentPath) {
        previousPathRef.current = currentPath
        animationFrameId = requestAnimationFrame(() => {
          ref.current?.focus({ preventScroll: true })
        })
      }
    })

    return () => {
      unsubscribe()
      if (animationFrameId !== undefined) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [ref, router])
}
