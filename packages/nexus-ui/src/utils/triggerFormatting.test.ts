import { describe, expect, it } from 'vitest'

import {
  parseRepeatingInterval,
  durationToHumanReadableCadence,
  formatDate,
  formatTime,
  formatIntervalDescription,
  parseTriggerLabel,
} from './triggerFormatting'

describe('parseRepeatingInterval', () => {
  it('parses interval with start and duration', () => {
    const result = parseRepeatingInterval('R/2024-01-01T10:00:00Z/P1D')

    expect(result).toEqual({
      start: '2024-01-01T10:00:00Z',
      cadence: 'P1D',
    })
  })

  it('parses interval with start, duration, and end', () => {
    const result = parseRepeatingInterval('R/2024-01-01T10:00:00Z/P1D/2024-12-31T23:59:59Z')

    expect(result).toEqual({
      start: '2024-01-01T10:00:00Z',
      cadence: 'P1D',
      end: '2024-12-31T23:59:59Z',
    })
  })

  it('returns empty values for invalid format', () => {
    expect(parseRepeatingInterval('')).toEqual({ start: '', cadence: '' })
    expect(parseRepeatingInterval('invalid')).toEqual({ start: '', cadence: '' })
    expect(parseRepeatingInterval('2024-01-01/P1D')).toEqual({ start: '', cadence: '' })
  })

  it('returns empty values for null-like input', () => {
    expect(parseRepeatingInterval(null as unknown as string)).toEqual({ start: '', cadence: '' })
  })
})

describe('durationToHumanReadableCadence', () => {
  it('converts P1D to Daily', () => {
    expect(durationToHumanReadableCadence('P1D')).toBe('Daily')
  })

  it('converts P7D to Weekly', () => {
    expect(durationToHumanReadableCadence('P7D')).toBe('Weekly')
  })

  it('converts P1W to Weekly', () => {
    expect(durationToHumanReadableCadence('P1W')).toBe('Weekly')
  })

  it('converts P1M to Monthly', () => {
    expect(durationToHumanReadableCadence('P1M')).toBe('Monthly')
  })

  it('converts P1Y to Annually', () => {
    expect(durationToHumanReadableCadence('P1Y')).toBe('Annually')
  })

  it('returns "Does not repeat" for unknown durations', () => {
    expect(durationToHumanReadableCadence('P2D')).toBe('Does not repeat')
    expect(durationToHumanReadableCadence('PT1H')).toBe('Does not repeat')
  })

  it('returns "Does not repeat" for empty input', () => {
    expect(durationToHumanReadableCadence('')).toBe('Does not repeat')
  })

  it('handles case-insensitive input', () => {
    expect(durationToHumanReadableCadence('p1d')).toBe('Daily')
    expect(durationToHumanReadableCadence('p1m')).toBe('Monthly')
  })

  it('trims whitespace', () => {
    expect(durationToHumanReadableCadence('  P1D  ')).toBe('Daily')
  })
})

describe('formatDate', () => {
  it('formats ISO date string', () => {
    const result = formatDate('2024-01-15T10:00:00Z')

    // Should contain month, day, year
    expect(result).toMatch(/Jan/)
    expect(result).toMatch(/15/)
    expect(result).toMatch(/2024/)
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

    // Result depends on local timezone, but should be in 12-hour format
    expect(result).toMatch(/\d{1,2}:\d{2}\s*(AM|PM)/i)
  })

  it('returns empty string for empty input', () => {
    expect(formatTime('')).toBe('')
  })

  it('returns empty string for invalid date', () => {
    expect(formatTime('not-a-date')).toBe('')
  })
})

describe('formatIntervalDescription', () => {
  it('formats complete interval description', () => {
    const result = formatIntervalDescription('R/2024-01-15T10:00:00Z/P1D')

    expect(result).toContain('Starts')
    expect(result).toContain('Repeats daily')
  })

  it('includes end date when present', () => {
    const result = formatIntervalDescription('R/2024-01-15T10:00:00Z/P1D/2024-12-31T23:59:59Z')

    expect(result).toContain('Ends')
  })

  it('returns empty string for invalid interval', () => {
    expect(formatIntervalDescription('')).toBe('')
    expect(formatIntervalDescription('invalid')).toBe('')
  })
})

describe('parseTriggerLabel', () => {
  it('parses simple label without details', () => {
    const result = parseTriggerLabel('Manual')

    expect(result).toEqual({ type: 'Manual', details: null })
  })

  it('parses label with parenthetical details', () => {
    const result = parseTriggerLabel('Manual (Requires Approval)')

    expect(result).toEqual({ type: 'Manual', details: 'Requires Approval' })
  })

  it('parses scheduled label with interval', () => {
    const result = parseTriggerLabel('Scheduled (Interval: R/2024-01-01T10:00:00Z/P1D)')

    expect(result.type).toBe('Scheduled')
    expect(result.details).toContain('Starts')
    expect(result.details).toContain('Repeats daily')
  })

  it('parses scheduled label with cron expression', () => {
    const result = parseTriggerLabel('Scheduled (Cron: 0 9 * * *)')

    expect(result).toEqual({ type: 'Scheduled', details: 'Cron: 0 9 * * *' })
  })

  it('parses scheduled label with continuous', () => {
    const result = parseTriggerLabel('Scheduled (Continuous)')

    expect(result).toEqual({ type: 'Scheduled', details: 'Continuous' })
  })

  it('returns label as type when no parentheses', () => {
    const result = parseTriggerLabel('Event-driven')

    expect(result).toEqual({ type: 'Event-driven', details: null })
  })

  it('handles whitespace in label', () => {
    // The regex trims the type from the match
    const result = parseTriggerLabel('Manual (Approval Required)')

    expect(result.type).toBe('Manual')
    expect(result.details).toBe('Approval Required')
  })

  it('falls back to raw details if interval formatting fails', () => {
    const result = parseTriggerLabel('Scheduled (Interval: invalid)')

    expect(result.type).toBe('Scheduled')
    expect(result.details).toBe('Interval: invalid')
  })
})
