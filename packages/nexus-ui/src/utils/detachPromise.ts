export type DetachPromiseOptions = {
  /**
   * Called when `result` rejects. Prefer this for security- or UX-sensitive flows (e.g. sign-out)
   * so failures are never only handled by the default path below.
   */
  onReject?: (reason: unknown) => void
}

/**
 * Normalizes an unknown rejection value for {@link globalThis.reportError} / logging.
 */
export function toReportableError(reason: unknown): Error {
  if (reason instanceof Error) {
    return reason
  }
  if (reason === undefined || reason === null) {
    return new Error('Detached promise rejected')
  }
  return new Error('Detached promise rejected', { cause: reason })
}

/**
 * Sends a detached rejection to {@link globalThis.reportError} when available; no-op otherwise.
 */
export function reportDetachedRejection(reason: unknown): void {
  if (typeof globalThis.reportError !== 'function') {
    return
  }
  globalThis.reportError(toReportableError(reason))
}

/**
 * Default when no `onReject`: dev console + production `reportError` (observable in monitoring /
 * window `error` listeners) without throwing. Callers that own errors (e.g. React Query) should
 * still surface UX; this avoids fully silent failures in production.
 */
function defaultDetachedRejectionHandler(reason: unknown): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console -- intentional dev-only breadcrumb
    console.warn('[detachPromise] rejected:', reason)
    return
  }
  reportDetachedRejection(reason)
}

/**
 * Fire-and-forget helper: attach a rejection handler so the result never surfaces as an
 * unhandled rejection. Uses {@link Promise.resolve} so it is safe when `result` is `undefined`
 * (for example when a test mock returns nothing instead of a Promise).
 *
 * **Do not use for auth bootstrap** (cookie refresh, OIDC provider list, etc.): use a named
 * `async` function inside `useEffect` with errors handled there, and a targeted
 * `eslint-disable-next-line @typescript-eslint/no-floating-promises` on the effect entry call if needed.
 *
 * Prefer **`await`** or an explicit **`.catch`** for other security-sensitive work (sign-out, token refresh UX).
 * Use {@link DetachPromiseOptions.onReject} when you detach from a sync callback but must run
 * custom failure handling (alerts, redirects). Reserve this helper for cases where the async owner
 * is clear (e.g. React Query `refetch`, UI `fitView`).
 */
export function detachPromise(result: unknown, options?: DetachPromiseOptions): void {
  Promise.resolve(result).catch((reason: unknown) => {
    ;(options?.onReject ?? defaultDetachedRejectionHandler)(reason)
  })
}
