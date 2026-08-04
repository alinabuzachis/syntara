import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'

import { formatHistoryDateTime, getDateGroupLabel } from './historyDateUtils'

describe('formatHistoryDateTime', () => {
  it('formats a valid ISO string', () => {
    const result = formatHistoryDateTime('2026-05-27T09:55:01Z')
    expect(result).toMatch(/May.*27.*2026/)
  })

  it('returns "-" for empty string', () => {
    expect(formatHistoryDateTime('')).toBe('-')
  })

  it('returns "-" for invalid date string', () => {
    expect(formatHistoryDateTime('not-a-date')).toBe('-')
  })
})

describe('getDateGroupLabel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "Today" for today\'s date', () => {
    vi.setSystemTime(new Date('2026-06-18T12:00:00Z'))
    expect(getDateGroupLabel('2026-06-18T08:30:00Z')).toBe('Today')
  })

  it('returns "Yesterday" for yesterday\'s date', () => {
    vi.setSystemTime(new Date('2026-06-18T12:00:00Z'))
    expect(getDateGroupLabel('2026-06-17T14:00:00Z')).toBe('Yesterday')
  })

  it('returns formatted date for older dates', () => {
    vi.setSystemTime(new Date('2026-06-18T12:00:00Z'))
    expect(getDateGroupLabel('2026-01-15T10:00:00Z')).toBe('January 15, 2026')
  })

  it('returns "Unknown" for empty string', () => {
    expect(getDateGroupLabel('')).toBe('Unknown')
  })

  it('returns "Unknown" for invalid date string', () => {
    expect(getDateGroupLabel('not-a-date')).toBe('Unknown')
  })

  it('returns "Unknown" for a string that causes parseISO to return NaN', () => {
    expect(getDateGroupLabel('9999-99-99')).toBe('Unknown')
  })
})
