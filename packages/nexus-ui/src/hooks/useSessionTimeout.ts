import { useCallback, useEffect, useRef, useState } from 'react'

import {
  COUNTDOWN_TICK_INTERVAL_MS,
  RETURN_TO_KEY,
  SESSION_EXPIRED_KEY,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_WARNING_BEFORE_MS,
} from '../components/session/sessionTimeoutConstants'
import { useAuthStore } from '../stores/useAuthStore'
import { detachPromise } from '../utils/detachPromise'

import { useIdleTimer } from './useIdleTimer'

export type SessionTimeoutPhase = 'active' | 'warning' | 'expired'

type UseSessionTimeoutReturn = {
  phase: SessionTimeoutPhase
  remainingSeconds: number
  continueSession: () => void
  logOut: () => void
}

const warningDurationMs = SESSION_WARNING_BEFORE_MS
const idleBeforeWarningMs = SESSION_IDLE_TIMEOUT_MS - SESSION_WARNING_BEFORE_MS

/**
 * Orchestrates the session timeout flow:
 *
 * 1. **active** – user is interacting normally; idle timer is counting.
 * 2. **warning** – idle threshold reached; modal visible with countdown.
 * 3. **expired** – countdown reached zero; user is logged out.
 *
 * "Continue Session" calls `refresh()` and resets everything to active.
 * "Log out" triggers an immediate manual logout (no location preservation).
 */
export function useSessionTimeout(): UseSessionTimeoutReturn {
  const [phase, setPhase] = useState<SessionTimeoutPhase>('active')
  const [remainingSeconds, setRemainingSeconds] = useState(Math.ceil(warningDurationMs / 1000))

  const refresh = useAuthStore((s) => s.refresh)
  const logout = useAuthStore((s) => s.logout)

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const expiryTimeRef = useRef<number>(0)

  const clearCountdown = useCallback(() => {
    if (countdownRef.current !== null) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
  }, [])

  const performTimeoutLogout = useCallback(() => {
    clearCountdown()
    setPhase('expired')

    sessionStorage.setItem(SESSION_EXPIRED_KEY, '1')
    sessionStorage.setItem(RETURN_TO_KEY, window.location.pathname + window.location.search)

    // Server-side revocation errors are handled by detachPromise's default
    // handler (console in dev, reportError in prod). A toast is not useful
    // here because the user is about to see the login page regardless.
    detachPromise(logout())
  }, [clearCountdown, logout])

  const startWarningCountdown = useCallback(() => {
    setPhase('warning')
    expiryTimeRef.current = Date.now() + warningDurationMs
    setRemainingSeconds(Math.ceil(warningDurationMs / 1000))

    clearCountdown()
    countdownRef.current = setInterval(() => {
      const msLeft = expiryTimeRef.current - Date.now()

      if (msLeft <= 0) {
        performTimeoutLogout()
        return
      }

      setRemainingSeconds(Math.ceil(msLeft / 1000))
    }, COUNTDOWN_TICK_INTERVAL_MS)
  }, [clearCountdown, performTimeoutLogout])

  useIdleTimer({
    timeoutMs: idleBeforeWarningMs,
    onIdle: startWarningCountdown,
    enabled: phase === 'active',
  })

  const continueSession = useCallback(() => {
    clearCountdown()
    setPhase('active')
    setRemainingSeconds(Math.ceil(warningDurationMs / 1000))
    detachPromise(refresh())
  }, [clearCountdown, refresh])

  const logOut = useCallback(() => {
    clearCountdown()
    setPhase('expired')
    // Same rationale as performTimeoutLogout — login page renders next.
    detachPromise(logout())
  }, [clearCountdown, logout])

  useEffect(() => {
    return clearCountdown
  }, [clearCountdown])

  return { phase, remainingSeconds, continueSession, logOut }
}
