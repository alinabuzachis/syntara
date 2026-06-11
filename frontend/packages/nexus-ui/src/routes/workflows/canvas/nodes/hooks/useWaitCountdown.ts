import { useEffect, useState } from 'react'

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

function computeRemaining(startedAt: string, durationSeconds: number): string {
  const targetTime = new Date(startedAt).getTime() + durationSeconds * 1000
  const ms = targetTime - Date.now()
  return formatRemaining(ms)
}

export function useWaitCountdown(
  status: ActivityStatus | undefined,
  startedAt: string | undefined | null,
  durationSeconds: number
): CountdownState {
  const isWaiting = status === 'waiting' || status === 'running'
  const isTerminal = status != null && TERMINAL_STATUSES.has(status)
  const shouldTick = isWaiting && !isTerminal && !!startedAt && durationSeconds > 0

  const [remaining, setRemaining] = useState<string | null>(null)

  if (!shouldTick && remaining !== null) {
    setRemaining(null)
  }

  useEffect(() => {
    if (!shouldTick) {
      return
    }

    const tick = () => {
      setRemaining(computeRemaining(startedAt, durationSeconds))
    }

    tick()
    const id = setInterval(tick, 1000)

    return () => {
      clearInterval(id)
    }
  }, [shouldTick, startedAt, durationSeconds])

  if (!shouldTick) {
    return { remaining: null, isActive: false }
  }

  return { remaining, isActive: remaining !== null }
}
