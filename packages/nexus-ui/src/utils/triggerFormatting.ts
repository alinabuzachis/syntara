/**
 * Utilities for formatting and parsing trigger-related data
 * Used for displaying human-readable trigger information in nodes and forms
 */

/**
 * Parsed repeating interval structure
 */
export interface ParsedRepeatingInterval {
  start: string
  cadence: string
  end?: string
}

/**
 * Parse an ISO 8601 repeating interval string into components
 * Supports formats like: "R/2024-01-01T10:00:00Z/P1D" or "R/2024-01-01T10:00:00Z/P1D/2024-12-31T23:59:59Z"
 */
export function parseRepeatingInterval(interval: string): ParsedRepeatingInterval {
  if (!interval?.startsWith('R/')) {
    return { start: '', cadence: '' }
  }

  // Remove 'R/' prefix
  const withoutPrefix = interval.substring(2)
  const parts = withoutPrefix.split('/')

  if (parts.length === 2) {
    // Format: R/start/duration
    return { start: parts[0], cadence: parts[1] }
  } else if (parts.length === 3) {
    // Format: R/start/duration/end
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
 * Format date to human-readable format (e.g., "Jan 1, 2026")
 */
export function formatDate(isoString: string): string {
  if (!isoString) return ''

  try {
    const date = new Date(isoString)
    if (Number.isNaN(date.getTime())) return ''

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

/**
 * Format time to 12-hour format (e.g., "12:00 AM")
 */
export function formatTime(isoString: string): string {
  if (!isoString) return ''

  try {
    const date = new Date(isoString)
    if (Number.isNaN(date.getTime())) return ''

    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return ''
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
