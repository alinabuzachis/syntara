import { parseISO } from 'date-fns'

export const GRACE_PERIOD_OPTIONS = [
  { value: 0, label: 'Immediately (no grace period)' },
  { value: 3600, label: '1 hour' },
  { value: 14400, label: '4 hours' },
  { value: 28800, label: '8 hours' },
  { value: 43200, label: '12 hours' },
  { value: 86400, label: '24 hours' },
] as const

export const DEFAULT_GRACE_PERIOD = 3600

/**
 * Computes remaining time label and formatted expiry for an active grace period.
 * Returns null if the grace period has already expired.
 */
export function computeRemainingGracePeriod(oldSecretValidUntil: string): {
  remainingLabel: string
  expiryFormatted: string
} | null {
  const expiry = parseISO(oldSecretValidUntil)
  if (Number.isNaN(expiry.getTime())) return null
  const now = new Date()
  const diffMs = expiry.getTime() - now.getTime()
  if (diffMs <= 0) return null

  const totalMinutes = Math.ceil(diffMs / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  let remainingLabel: string
  if (hours >= 1 && minutes > 0) {
    remainingLabel = `${hours}h ${minutes}m`
  } else if (hours >= 1) {
    remainingLabel = `${hours}h`
  } else {
    remainingLabel = `${minutes}m`
  }

  const expiryFormatted = expiry.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  })

  return { remainingLabel, expiryFormatted }
}

export function formatGracePeriodDuration(seconds: number): string {
  return GRACE_PERIOD_OPTIONS.find((opt) => opt.value === seconds)?.label ?? `${Math.round(seconds / 3600)} hours`
}
