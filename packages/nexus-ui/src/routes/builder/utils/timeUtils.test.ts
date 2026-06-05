import { describe, expect, it } from 'vitest'

import { formatDurationLabel, secondsToTimeUnits, timeUnitsToSeconds } from './timeUtils'

describe('secondsToTimeUnits', () => {
  it('converts 0 seconds to all zeros', () => {
    expect(secondsToTimeUnits(0)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 })
  })

  it('converts seconds only', () => {
    expect(secondsToTimeUnits(45)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 45 })
  })

  it('converts minutes and seconds', () => {
    expect(secondsToTimeUnits(125)).toEqual({ days: 0, hours: 0, minutes: 2, seconds: 5 })
  })

  it('converts hours, minutes, seconds', () => {
    expect(secondsToTimeUnits(3661)).toEqual({ days: 0, hours: 1, minutes: 1, seconds: 1 })
  })

  it('converts days, hours, minutes, seconds', () => {
    expect(secondsToTimeUnits(90061)).toEqual({ days: 1, hours: 1, minutes: 1, seconds: 1 })
  })

  it('converts exact day boundary', () => {
    expect(secondsToTimeUnits(86400)).toEqual({ days: 1, hours: 0, minutes: 0, seconds: 0 })
  })

  it('converts large value (30 days)', () => {
    expect(secondsToTimeUnits(2592000)).toEqual({ days: 30, hours: 0, minutes: 0, seconds: 0 })
  })
})

describe('timeUnitsToSeconds', () => {
  it('converts all zeros to 0', () => {
    expect(timeUnitsToSeconds(0, 0, 0, 0)).toBe(0)
  })

  it('converts seconds only', () => {
    expect(timeUnitsToSeconds(30, 0, 0, 0)).toBe(30)
  })

  it('converts minutes only', () => {
    expect(timeUnitsToSeconds(0, 5, 0, 0)).toBe(300)
  })

  it('converts hours only', () => {
    expect(timeUnitsToSeconds(0, 0, 2, 0)).toBe(7200)
  })

  it('converts days only', () => {
    expect(timeUnitsToSeconds(0, 0, 0, 1)).toBe(86400)
  })

  it('converts mixed units', () => {
    expect(timeUnitsToSeconds(5, 10, 2, 1)).toBe(86400 + 7200 + 600 + 5)
  })

  it('uses default values when arguments omitted', () => {
    expect(timeUnitsToSeconds()).toBe(0)
  })
})

describe('formatDurationLabel', () => {
  it('returns "Not configured" for 0 seconds', () => {
    expect(formatDurationLabel(0)).toBe('Not configured')
  })

  it('formats seconds only', () => {
    expect(formatDurationLabel(45)).toBe('45s')
  })

  it('formats minutes and seconds', () => {
    expect(formatDurationLabel(125)).toBe('2m 5s')
  })

  it('formats hours, minutes, seconds', () => {
    expect(formatDurationLabel(3661)).toBe('1h 1m 1s')
  })

  it('formats days, hours, minutes, seconds', () => {
    expect(formatDurationLabel(90061)).toBe('1d 1h 1m 1s')
  })

  it('omits zero units', () => {
    expect(formatDurationLabel(86400)).toBe('1d')
    expect(formatDurationLabel(3600)).toBe('1h')
    expect(formatDurationLabel(300)).toBe('5m')
  })

  it('formats 30 days', () => {
    expect(formatDurationLabel(2592000)).toBe('30d')
  })
})
