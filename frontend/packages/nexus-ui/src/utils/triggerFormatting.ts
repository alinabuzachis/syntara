/**
 * Utilities for formatting and parsing trigger-related data
 * Used for displaying human-readable trigger information in nodes and forms
 */

import { formatDate, formatTime } from './dateUtils'

/**
 * Parsed repeating interval structure
 */
export type ParsedRepeatingInterval = {
  start: string
  cadence: string
  end?: string
}

/**
 * Parse an ISO 8601 repeating interval string into components.
 * Supports: "R/start/duration", "R/start/duration/end", and run-once "R1/start/PT0S".
 */
export function parseRepeatingInterval(interval: string): ParsedRepeatingInterval {
  if (!interval?.startsWith('R')) {
    return { start: '', cadence: '' }
  }

  // R1/start/PT0S (run once) or R/start/duration[/end]
  const withoutPrefix = interval.startsWith('R/')
    ? interval.substring(2)
    : interval.substring(interval.indexOf('/') + 1)
  const parts = withoutPrefix.split('/')

  if (parts.length === 2) {
    return { start: parts[0], cadence: parts[1] }
  }
  if (parts.length === 3) {
    return { start: parts[0], cadence: parts[1], end: parts[2] }
  }

  return { start: '', cadence: '' }
}

/**
 * Convert ISO 8601 duration string to human-readable cadence
 */
export function durationToHumanReadableCadence(duration: string): string {
  if (!duration) return 'Does not repeat'

  const normalized = duration.toUpperCase().trim()

  switch (normalized) {
    case 'P1D':
      return 'Daily'
    case 'P7D':
    case 'P1W':
      return 'Weekly'
    case 'P1M':
      return 'Monthly'
    case 'P1Y':
      return 'Annually'
    default:
      return 'Does not repeat'
  }
}

/**
 * Format ISO 8601 interval string to human-readable description
 * Example: "Starts Jan 1, 2026 at 12:00 AM\nRepeats weekly\nEnds Feb 6, 2026"
 */
export function formatIntervalDescription(interval: string): string {
  const parsed = parseRepeatingInterval(interval)
  if (!parsed.start || !parsed.cadence) return ''

  const startDate = formatDate(parsed.start)
  const startTime = formatTime(parsed.start)
  const cadence = durationToHumanReadableCadence(parsed.cadence)
  const endDate = parsed.end ? formatDate(parsed.end) : null

  const parts: string[] = []

  if (startDate) {
    const startLine = startTime ? `Starts ${startDate} at ${startTime}` : `Starts ${startDate}`
    parts.push(startLine)
  }

  // Check the raw duration value instead of the translated string
  if (parsed.cadence) {
    parts.push(`Repeats ${cadence.toLowerCase()}`)
  }

  if (endDate) {
    parts.push(`Ends ${endDate}`)
  }

  return parts.join('\n')
}

/**
 * Format an ISO 8601 repeating interval as a single-line plain-language summary.
 * Returns null if the interval cannot be parsed into a supported format.
 *
 * Examples:
 * - "Daily at 10:00 AM starting Jan 1, 2024"
 * - "Weekly at 2:30 PM starting Jan 1, 2024, ending Dec 31, 2024"
 * - "Once on Jan 15, 2024 at 12:00 AM"
 */
export function formatScheduleSummary(interval: string): string | null {
  const parsed = parseRepeatingInterval(interval)
  if (!parsed.start || !parsed.cadence) return null

  const cadence = durationToHumanReadableCadence(parsed.cadence)
  const startDate = formatDate(parsed.start)
  if (!startDate) return null

  const startTime = formatTime(parsed.start)

  if (cadence === 'Does not repeat') {
    if (interval.startsWith('R1')) {
      return startTime ? `Once on ${startDate} at ${startTime}` : `Once on ${startDate}`
    }
    return null
  }

  let summary = startTime ? `${cadence} at ${startTime}` : cadence
  summary += ` starting ${startDate}`

  if (parsed.end) {
    const endDate = formatDate(parsed.end)
    if (endDate) {
      summary += `, ending ${endDate}`
    }
  }

  return summary
}
