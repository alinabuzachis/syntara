import { useEffect, useRef, useState } from 'react'

import { secondsToTimeUnits } from '../../../../builder/utils/timeUtils'
import type { ActivityStatus } from '../../../execution/types'

const TERMINAL_STATUSES = new Set<ActivityStatus>(['completed', 'failed', 'cancelled', 'skipped'])

export type CountdownState = {
  remaining: string | null
  isActive: boolean
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '00:00:00'

  const total = Math.ceil(ms / 1000)
  const { days, hours, minutes, seconds } = secondsToTimeUnits(total)

  const hh = String(hours).padStart(2, '0')
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')

  if (days > 0) return `${days}d ${hh}:${mm}:${ss}`
  return `${hh}:${mm}:${ss}`
}

/**
 * Countdown hook for Wait nodes. Uses a direct Zustand subscription in the
 * parent component to bypass React Flow's node enrichment pipeline, ensuring
 * timely status updates drive the countdown without page refresh.
 */
export function useWaitCountdown(
  status: ActivityStatus | undefined,
  startedAt: string | undefined | null,
  durationSeconds: number
): CountdownState {
  const isWaiting = status === 'waiting' || status === 'running'
  const isTerminal = status != null && TERMINAL_STATUSES.has(status)
  const shouldTick = isWaiting && !isTerminal && durationSeconds > 0

  const [remaining, setRemaining] = useState<string | null>(null)
  const fallbackRef = useRef<string | null>(null)

  useEffect(() => {
    if (!shouldTick) {
      fallbackRef.current = null
      return
    }

    let effectiveStartedAt = startedAt
    if (!effectiveStartedAt) {
      // startedAt not yet received; use now as a conservative baseline.
      // When the real startedAt arrives later the countdown may jump.
      fallbackRef.current ??= new Date().toISOString()
      effectiveStartedAt = fallbackRef.current
    }

    const targetTime = new Date(effectiveStartedAt).getTime() + durationSeconds * 1000

    const update = () => {
      setRemaining(formatRemaining(targetTime - Date.now()))
    }

    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [shouldTick, startedAt, durationSeconds])

  return { remaining: shouldTick ? remaining : null, isActive: shouldTick && remaining !== null }
}
