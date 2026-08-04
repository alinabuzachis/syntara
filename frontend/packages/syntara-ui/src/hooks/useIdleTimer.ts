import { useCallback, useEffect, useRef } from 'react'

import { ACTIVITY_EVENTS } from '../components/session/sessionTimeoutConstants'

type UseIdleTimerOptions = {
  /** Milliseconds of inactivity before `onIdle` fires. */
  timeoutMs: number
  /** Called once when the user has been idle for `timeoutMs`. */
  onIdle: () => void
  /** Called when the user becomes active again after being idle. */
  onActive?: () => void
  /** Whether the timer is running. Set to `false` to pause. */
  enabled?: boolean
}

/**
 * Tracks user activity via DOM events and fires a callback after a
 * period of inactivity. Resets automatically on any qualifying activity.
 *
 * The hook intentionally avoids React state for the last-activity
 * timestamp to prevent re-renders on every mouse move.
 */
export function useIdleTimer({ timeoutMs, onIdle, onActive, enabled = true }: UseIdleTimerOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isIdleRef = useRef(false)

  const onIdleRef = useRef(onIdle)
  const onActiveRef = useRef(onActive)

  useEffect(() => {
    onIdleRef.current = onIdle
    onActiveRef.current = onActive
  }, [onIdle, onActive])

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startTimer = useCallback(() => {
    clearTimer()
    timerRef.current = setTimeout(() => {
      isIdleRef.current = true
      onIdleRef.current()
    }, timeoutMs)
  }, [clearTimer, timeoutMs])

  const handleActivity = useCallback(() => {
    if (!enabled) return

    if (isIdleRef.current) {
      isIdleRef.current = false
      onActiveRef.current?.()
    }

    startTimer()
  }, [enabled, startTimer])

  /** Programmatically reset the idle timer (e.g. after "Continue Session"). */
  const reset = useCallback(() => {
    isIdleRef.current = false
    if (enabled) {
      startTimer()
    }
  }, [enabled, startTimer])

  useEffect(() => {
    if (!enabled) {
      clearTimer()
      return
    }

    startTimer()

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleActivity()
      }
    }

    for (const event of ACTIVITY_EVENTS) {
      document.addEventListener(event, handleActivity, { passive: true })
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearTimer()
      for (const event of ACTIVITY_EVENTS) {
        document.removeEventListener(event, handleActivity)
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, startTimer, handleActivity, clearTimer])

  return { reset }
}
