/**
 * Date utilities (formatting and helpers) using date-fns.
 * Single place for date-related display logic; use for UI only, not logic (per i18n guidelines).
 */

import { format, intervalToDuration, parseISO } from 'date-fns'

/**
 * Format an ISO date string for display (e.g. "Jan 15, 2024").
 * Returns empty string for invalid or empty input.
 */
export function formatDate(isoString: string): string {
  if (!isoString) return ''
  try {
    const date = parseISO(isoString)
    if (Number.isNaN(date.getTime())) return ''
    return format(date, 'MMM d, yyyy')
  } catch {
    return ''
  }
}

/**
 * Format an ISO date string as 12-hour time (e.g. "2:30 PM").
 * Returns empty string for invalid or empty input.
 */
export function formatTime(isoString: string): string {
  if (!isoString) return ''
  try {
    const date = parseISO(isoString)
    if (Number.isNaN(date.getTime())) return ''
    return format(date, 'h:mm a')
  } catch {
    return ''
  }
}

/**
 * Format an ISO date string as medium date + short time (locale-aware).
 * Returns '-' for invalid or empty input (suitable for table/description list cells).
 */
export function formatDateTime(isoString?: string | null): string {
  if (!isoString) return '-'
  try {
    const date = parseISO(isoString)
    if (Number.isNaN(date.getTime())) return '-'
    return format(date, 'PPp')
  } catch {
    return '-'
  }
}

/**
 * Format an elapsed duration in milliseconds as "Xh Ym Zs" (e.g. "1h 2m 3s").
 * Always includes seconds; includes minutes/hours when non-zero.
 * Durations >= 24h are shown as total hours (e.g. 25h 0m 0s).
 */
export function formatElapsedTime(elapsedMs: number): string {
  const totalMs = Math.max(0, Math.floor(elapsedMs))
  const duration = intervalToDuration({ start: new Date(0), end: new Date(totalMs) })
  const totalHours = (duration.days ?? 0) * 24 + (duration.hours ?? 0)
  const minutes = duration.minutes ?? 0
  const seconds = duration.seconds ?? 0

  const parts: string[] = []
  if (totalHours > 0) parts.push(`${totalHours}h`)
  if (minutes > 0 || totalHours > 0) parts.push(`${minutes}m`)
  parts.push(`${seconds}s`)
  return parts.join(' ')
}

/**
 * Format a Date object to ISO 8601 string for API compatibility.
 * Use this for sending dates to the API in filter parameters.
 *
 * @example
 * formatDateForApi(new Date('2024-01-01T12:00:00Z'))
 * // → '2024-01-01T12:00:00.000Z'
 */
export function formatDateForApi(date: Date): string {
  return date.toISOString()
}
