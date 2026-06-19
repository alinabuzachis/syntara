import { format, isToday, isYesterday, parseISO } from 'date-fns'

import { formatDateTime } from '../../utils/dateUtils'

function safeParseDate(isoString: string): Date | null {
  if (!isoString) return null
  try {
    const date = parseISO(isoString)
    return Number.isNaN(date.getTime()) ? null : date
  } catch {
    return null
  }
}

export function formatHistoryDateTime(isoString: string): string {
  return formatDateTime(isoString)
}

export function getDateGroupLabel(isoString: string): string {
  const date = safeParseDate(isoString)
  if (!date) return 'Unknown'
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'MMMM d, yyyy')
}
