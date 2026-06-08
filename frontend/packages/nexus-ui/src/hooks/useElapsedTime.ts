import { useEffect, useMemo, useState } from 'react'

type ElapsedTimeResult = {
  /** Elapsed milliseconds, or `undefined` when `startedAt` is absent/unparseable. */
  elapsedMs: number | undefined
  /** Current timestamp (ms) — ticks every second while running, stable otherwise. */
  now: number
}

/**
 * Computes elapsed time in milliseconds between `startedAt` and either
 * `completedAt` (terminal) or the current clock tick (while running).
 *
 * Also exposes the current `now` timestamp so callers can share the
 * same 1-second tick for other time computations without a second interval.
 */
export function useElapsedTime(
  startedAt: string | null | undefined,
  completedAt: string | null | undefined,
  isRunning: boolean
): ElapsedTimeResult {
  const [now, setNow] = useState(() => Date.now())

  const startedAtMs = startedAt != null ? Date.parse(startedAt) : null
  const completedAtMs = completedAt != null ? Date.parse(completedAt) : null

  useEffect(() => {
    if (startedAtMs === null || Number.isNaN(startedAtMs) || !isRunning || completedAtMs !== null) {
      return
    }
    const interval = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [startedAtMs, isRunning, completedAtMs])

  const elapsedMs = useMemo(() => {
    if (startedAtMs === null || Number.isNaN(startedAtMs)) {
      return undefined
    }
    const validCompletedAt = completedAtMs !== null && !Number.isNaN(completedAtMs) ? completedAtMs : undefined
    const endMs = validCompletedAt ?? (isRunning ? now : undefined)
    if (endMs === undefined) {
      return undefined
    }
    return Math.max(0, endMs - startedAtMs)
  }, [startedAtMs, completedAtMs, isRunning, now])

  return { elapsedMs, now }
}
