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
