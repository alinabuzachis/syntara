/** Total idle time before the session is terminated (30 minutes). */
export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000

/** How long before timeout the warning modal appears (5 minutes). */
export const SESSION_WARNING_BEFORE_MS = 5 * 60 * 1000

/** How frequently the countdown display updates while the warning modal is visible. */
export const COUNTDOWN_TICK_INTERVAL_MS = 1000

/** `sessionStorage` key used to signal that the previous logout was due to inactivity. */
export const SESSION_EXPIRED_KEY = 'ao_session_expired'

/** `sessionStorage` key used to preserve the user's location across a timeout logout. */
export const RETURN_TO_KEY = 'ao_return_to'

/** `sessionStorage` key set on explicit logout to suppress bootstrap refresh on page reload. */
export const EXPLICIT_LOGOUT_KEY = 'ao_explicit_logout'

/** DOM events that count as user activity for idle detection. */
export const ACTIVITY_EVENTS: ReadonlyArray<keyof DocumentEventMap> = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
]
