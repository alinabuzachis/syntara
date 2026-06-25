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
 * Format an ISO date string as medium date + time with seconds (locale-aware).
 * e.g. "May 27, 2026, 9:55:01 AM" (MMM DD, YYYY, H:MM:SS AM/PM per UX skill §3).
 * Returns '-' for invalid or empty input (suitable for table/description list cells).
 */
export function formatDateTime(isoString?: string | null): string {
  if (!isoString) return '-'
  try {
    const date = parseISO(isoString)
    if (Number.isNaN(date.getTime())) return '-'
    return format(date, 'PPpp')
  } catch {
    return '-'
  }
}

/**
 * Format an ISO date string as "10:00:00 AM, 26 Jan 2026" (with seconds).
 * Used in execution detail tables where seconds precision is needed.
 * Returns '-' for invalid or empty input.
 */
export function formatExecutionDateTime(isoString: string): string {
  if (!isoString) return '-'
  try {
    const date = parseISO(isoString)
    if (Number.isNaN(date.getTime())) return '-'
    const time = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    })
    return `${time}, ${date.getDate()} ${format(date, 'MMM')} ${date.getFullYear()}`
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
 * Format an ISO date string as time only (e.g. "10:00:00 AM").
 * Used when the date portion is redundant (same-day ranges).
 * Returns '-' for invalid or empty input.
 */
export function formatExecutionTime(isoString: string): string {
  if (!isoString) return '-'
  try {
    const date = parseISO(isoString)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    })
  } catch {
    return '-'
  }
}

/**
 * Check whether two ISO date strings fall on the same calendar day.
 */
export function isSameDay(a: string, b: string): boolean {
  const da = parseISO(a)
  const db = parseISO(b)
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
}

/**
 * Format a start–end time range for compact display.
 * When both timestamps share the same calendar day, the start shows time only
 * and the end includes the full date (e.g. "10:00:00 AM - 10:01:30 AM, 16 Apr 2026").
 * When they span different days, both include the full date.
 */
export function formatTimeRange(startedAt?: string | null, completedAt?: string | null): string | undefined {
  if (!startedAt) return undefined
  if (!completedAt) return formatExecutionDateTime(startedAt)
  const start = isSameDay(startedAt, completedAt) ? formatExecutionTime(startedAt) : formatExecutionDateTime(startedAt)
  return `${start} - ${formatExecutionDateTime(completedAt)}`
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

/**
 * Extracts the calendar date (YYYY-MM-DD) from a UTC ISO string for chip display.
 * Avoids timezone shifts by using only the date portion.
 *
 * @example
 * formatDateChipValue('2026-04-26T00:00:00.000Z') // → '2026-04-26'
 * formatDateChipValue('2026-05-01T23:59:59.999Z') // → '2026-05-01'
 */
export function formatDateChipValue(isoValue: string): string {
  return isoValue.split('T')[0] ?? ''
}

/**
 * Format an ISO date string as a compact relative time (e.g. "5m ago", "2h ago").
 * Returns "Never" for null/undefined input, "Just now" for future dates.
 *
 * Intentionally manual rather than date-fns formatDistanceToNow, which
 * produces verbose strings ("about 5 minutes ago") unsuitable for compact UI.
 */
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function formatTimeAgo(isoString: string | null | undefined): string {
  if (!isoString) return 'Never'
  const diff = Date.now() - new Date(isoString).getTime()
  if (diff < 0) return 'Just now'
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return rtf.format(-seconds, 'second')
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return rtf.format(-minutes, 'minute')
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return rtf.format(-hours, 'hour')
  const days = Math.floor(hours / 24)
  return rtf.format(-days, 'day')
}
