import { describe, expect, it } from 'vitest'

import { formatHistoryDateTime, getDateGroupLabel } from './historyDateUtils'

describe('formatHistoryDateTime', () => {
  it('formats a valid ISO date string', () => {
    const result = formatHistoryDateTime('2026-05-19T14:30:00.000Z')
    expect(result).toMatch(/May 19, 2026/)
  })

  it('returns "-" for an empty string', () => {
    expect(formatHistoryDateTime('')).toBe('-')
  })

  it('returns "-" for an invalid date string', () => {
    expect(formatHistoryDateTime('not-a-date')).toBe('-')
  })
})

describe('getDateGroupLabel', () => {
  it('returns "Today" for today\'s date', () => {
    const now = new Date()
    expect(getDateGroupLabel(now.toISOString())).toBe('Today')
  })

  it('returns "Yesterday" for yesterday\'s date', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    expect(getDateGroupLabel(yesterday.toISOString())).toBe('Yesterday')
  })

  it('returns formatted date for older dates', () => {
    const result = getDateGroupLabel('2026-01-15T10:00:00.000Z')
    expect(result).toBe('January 15, 2026')
  })

  it('returns "Unknown" for an empty string', () => {
    expect(getDateGroupLabel('')).toBe('Unknown')
  })

  it('returns "Unknown" for an invalid date string', () => {
    expect(getDateGroupLabel('invalid')).toBe('Unknown')
  })
})
