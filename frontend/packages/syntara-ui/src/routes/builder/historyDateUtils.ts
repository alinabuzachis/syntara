import { format, isToday, isYesterday, parseISO } from 'date-fns'

function safeParseDate(isoString: string): Date | null {
  if (!isoString) return null
  try {
    const date = parseISO(isoString)
    return Number.isNaN(date.getTime()) ? null : date
  } catch {
    return null
  }
}

/**
 * Format timestamp for run history list items.
 * Returns format like "Jul 9, 2026, 9:43 AM" (no seconds per UX mockup).
 */
export function formatHistoryDateTime(isoString: string): string {
  const date = safeParseDate(isoString)
  if (!date) return '-'
  // PPp format: "MMM d, yyyy, h:mm a" (no seconds)
  return format(date, 'PPp')
}

export function getDateGroupLabel(isoString: string): string {
  const date = safeParseDate(isoString)
  if (!date) return 'Unknown'
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'MMMM d, yyyy')
}
