import { useCallback, useEffect, useRef, useState } from 'react'

import { detachPromise } from '../utils/detachPromise'

const COPIED_FEEDBACK_MS = 2000

/**
 * Hook for copying text to the clipboard with a brief "copied" feedback state.
 *
 * Clears the previous feedback timer before starting a new one to prevent leaks
 * when the user clicks the copy button in rapid succession.
 */
export function useCopyToClipboard() {
  const [isCopied, setIsCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear any outstanding timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  const copy = useCallback((text: string) => {
    if (!navigator.clipboard?.writeText) return

    // Clear the previous timer so rapid clicks don't stack up stale resets
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    detachPromise(
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setIsCopied(true)
          timerRef.current = setTimeout(() => {
            setIsCopied(false)
            timerRef.current = null
          }, COPIED_FEEDBACK_MS)
        })
        .catch(() => {
          // Clipboard denied or unavailable — do not show success state
        })
    )
  }, [])

  return { isCopied, copy } as const
}
