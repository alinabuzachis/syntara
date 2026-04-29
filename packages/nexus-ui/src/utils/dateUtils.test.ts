import { describe, expect, it } from 'vitest'

import {
  formatDate,
  formatDateTime,
  formatElapsedTime,
  formatExecutionDateTime,
  formatExecutionTime,
  formatTime,
  formatTimeRange,
  isSameDay,
} from './dateUtils'

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

describe('formatExecutionTime', () => {
  it('produces "HH:MM:SS AM/PM" format without date', () => {
    expect(formatExecutionTime('2026-01-26T15:30:45Z')).toMatch(/\d{2}:\d{2}:\d{2}\s[AP]M/)
  })

  it('does not include date portions', () => {
    const result = formatExecutionTime('2026-01-26T10:00:00Z')
    expect(result).not.toContain('Jan')
    expect(result).not.toContain('2026')
  })

  it('returns "-" for empty string', () => {
    expect(formatExecutionTime('')).toBe('-')
  })

  it('returns "-" for invalid date', () => {
    expect(formatExecutionTime('not-a-date')).toBe('-')
  })
})

describe('isSameDay', () => {
  it('returns true for timestamps on the same day', () => {
    expect(isSameDay('2026-04-16T10:00:00Z', '2026-04-16T23:59:59Z')).toBe(true)
  })

  it('returns false for timestamps on different days', () => {
    expect(isSameDay('2026-04-15T12:00:00Z', '2026-04-17T12:00:00Z')).toBe(false)
  })

  it('returns false for different months', () => {
    expect(isSameDay('2026-03-16T10:00:00Z', '2026-04-16T10:00:00Z')).toBe(false)
  })

  it('returns false for different years', () => {
    expect(isSameDay('2025-04-16T10:00:00Z', '2026-04-16T10:00:00Z')).toBe(false)
  })
})

describe('formatTimeRange', () => {
  it('returns undefined when startedAt is null', () => {
    expect(formatTimeRange(null, null)).toBeUndefined()
  })

  it('returns undefined when startedAt is undefined', () => {
    expect(formatTimeRange(undefined, undefined)).toBeUndefined()
  })

  it('returns full date/time when completedAt is null', () => {
    const result = formatTimeRange('2026-04-16T10:00:00Z', null)
    expect(result).toMatch(/\d{2}:\d{2}:\d{2}\s[AP]M,\s\d+\s\w{3}\s2026/)
  })

  it('uses time-only for start when same day', () => {
    const result = formatTimeRange('2026-04-16T10:00:00Z', '2026-04-16T10:01:30Z')!
    // Start should be time-only (no date), end should have full date
    expect(result).toContain(' - ')
    const [start, end] = result.split(' - ')
    // Start: time-only, no year/month
    expect(start).not.toContain('2026')
    expect(start).toMatch(/\d{2}:\d{2}:\d{2}\s[AP]M/)
    // End: full date/time
    expect(end).toContain('2026')
  })

  it('uses full date/time for both when different days', () => {
    const result = formatTimeRange('2026-04-15T12:00:00Z', '2026-04-17T12:00:00Z')!
    expect(result).toContain(' - ')
    const [start, end] = result.split(' - ')
    // Both should have full dates
    expect(start).toContain('2026')
    expect(end).toContain('2026')
  })
})
