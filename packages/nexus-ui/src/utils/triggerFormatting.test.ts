import { describe, expect, it } from 'vitest'

import { parseRepeatingInterval, durationToHumanReadableCadence, formatIntervalDescription } from './triggerFormatting'

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
