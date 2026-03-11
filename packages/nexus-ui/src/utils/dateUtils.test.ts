import { describe, expect, it } from 'vitest'

import { formatDate, formatDateTime, formatElapsedTime, formatExecutionDateTime, formatTime } from './dateUtils'

describe('formatDate', () => {
  it('formats ISO date string as MMM d, yyyy', () => {
    expect(formatDate('2024-01-15T10:00:00Z')).toMatch(/Jan.*15.*2024/)
  })

  it('returns empty string for empty input', () => {
    expect(formatDate('')).toBe('')
  })

  it('returns empty string for invalid date', () => {
    expect(formatDate('not-a-date')).toBe('')
  })
})

describe('formatTime', () => {
  it('formats time in 12-hour format', () => {
    const result = formatTime('2024-01-15T14:30:00Z')
    expect(result).toMatch(/\d{1,2}:\d{2}\s*(AM|PM)/i)
  })

  it('returns empty string for empty input', () => {
    expect(formatTime('')).toBe('')
  })

  it('returns empty string for invalid date', () => {
    expect(formatTime('not-a-date')).toBe('')
  })
})

describe('formatDateTime', () => {
  it('formats ISO string as date and time', () => {
    const result = formatDateTime('2024-01-15T14:30:00Z')
    expect(result).not.toBe('-')
    expect(result.length).toBeGreaterThan(5)
  })

  it('returns "-" for null', () => {
    expect(formatDateTime(null)).toBe('-')
  })

  it('returns "-" for undefined', () => {
    expect(formatDateTime(undefined)).toBe('-')
  })

  it('returns "-" for empty string', () => {
    expect(formatDateTime('')).toBe('-')
  })

  it('returns "-" for invalid date', () => {
    expect(formatDateTime('not-a-date')).toBe('-')
  })
})

describe('formatExecutionDateTime', () => {
  it('produces "HH:MM:SS AM/PM, D Mon YYYY" format', () => {
    expect(formatExecutionDateTime('2026-01-26T15:30:45Z')).toMatch(/\d{2}:\d{2}:\d{2}\s[AP]M,\s\d+\s\w{3}\s2026/)
  })

  it('includes abbreviated month and full year', () => {
    expect(formatExecutionDateTime('2025-12-25T10:00:00Z')).toMatch(/Dec.*2025/)
  })

  it('returns "-" for empty string', () => {
    expect(formatExecutionDateTime('')).toBe('-')
  })

  it('returns "-" for invalid date', () => {
    expect(formatExecutionDateTime('not-a-date')).toBe('-')
  })
})

describe('formatElapsedTime', () => {
  it('formats milliseconds as Xh Ym Zs', () => {
    expect(formatElapsedTime(3661000)).toBe('1h 1m 1s')
  })

  it('formats seconds only when under a minute', () => {
    expect(formatElapsedTime(45000)).toBe('45s')
  })

  it('formats hours and minutes', () => {
    expect(formatElapsedTime(7320000)).toBe('2h 2m 0s')
  })

  it('handles zero', () => {
    expect(formatElapsedTime(0)).toBe('0s')
  })

  it('floors negative to zero', () => {
    expect(formatElapsedTime(-1000)).toBe('0s')
  })

  it('formats durations >= 24h as total hours', () => {
    expect(formatElapsedTime(25 * 60 * 60 * 1000)).toBe('25h 0m 0s')
  })

  it('formats 1d 1h 1m 1s as 25h 1m 1s', () => {
    const ms = 24 * 60 * 60 * 1000 + 60 * 60 * 1000 + 60 * 1000 + 1000 // 90061000
    expect(formatElapsedTime(ms)).toBe('25h 1m 1s')
  })
})
