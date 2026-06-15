export function secondsToTimeUnits(totalSeconds: number): {
  days: number
  hours: number
  minutes: number
  seconds: number
} {
  const days = Math.floor(totalSeconds / 86400)
  const remainingAfterDays = totalSeconds % 86400
  const hours = Math.floor(remainingAfterDays / 3600)
  const remainingAfterHours = remainingAfterDays % 3600
  const minutes = Math.floor(remainingAfterHours / 60)
  const seconds = remainingAfterHours % 60
  return { days, hours, minutes, seconds }
}

export function timeUnitsToSeconds(seconds = 0, minutes = 0, hours = 0, days = 0): number {
  return seconds + minutes * 60 + hours * 3600 + days * 86400
}

export function formatDurationLabel(totalSeconds: number): string {
  const { days, hours, minutes, seconds } = secondsToTimeUnits(totalSeconds)
  const parts: string[] = []
  if (days) parts.push(`${days}d`)
  if (hours) parts.push(`${hours}h`)
  if (minutes) parts.push(`${minutes}m`)
  if (seconds) parts.push(`${seconds}s`)
  return parts.length > 0 ? parts.join(' ') : 'Not configured'
}

/** Format a duration in seconds as a compact human-readable string, e.g. "1d 2h 3m 4s". Zero units are omitted. */
export function formatDuration(totalSeconds: number): string {
  const { days, hours, minutes, seconds } = secondsToTimeUnits(totalSeconds)
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (seconds > 0) parts.push(`${seconds}s`)
  return parts.length > 0 ? parts.join(' ') : '0s'
}
