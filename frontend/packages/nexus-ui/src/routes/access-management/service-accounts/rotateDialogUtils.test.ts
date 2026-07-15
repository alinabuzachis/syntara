import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  computeRemainingGracePeriod,
  DEFAULT_GRACE_PERIOD,
  formatGracePeriodDuration,
  GRACE_PERIOD_OPTIONS,
} from './rotateDialogUtils'

describe('rotateDialogUtils', () => {
  describe('GRACE_PERIOD_OPTIONS', () => {
    it('contains expected options within backend limit of 86400', () => {
      expect(GRACE_PERIOD_OPTIONS).toHaveLength(6)
      expect(GRACE_PERIOD_OPTIONS[0]).toEqual({ value: 0, label: 'Immediately (no grace period)' })
      for (const opt of GRACE_PERIOD_OPTIONS) {
        expect(opt.value).toBeGreaterThanOrEqual(0)
        expect(opt.value).toBeLessThanOrEqual(86400)
      }
    })
  })

  describe('DEFAULT_GRACE_PERIOD', () => {
    it('is 1 hour', () => {
      expect(DEFAULT_GRACE_PERIOD).toBe(3600)
    })
  })

  describe('formatGracePeriodDuration', () => {
    it.each([
      [3600, '1 hour'],
      [14400, '4 hours'],
      [86400, '24 hours'],
    ])('returns label for known value %i', (seconds, expected) => {
      expect(formatGracePeriodDuration(seconds)).toBe(expected)
    })

    it('returns fallback for unknown values', () => {
      expect(formatGracePeriodDuration(7200)).toBe('2 hours')
    })
  })

  describe('computeRemainingGracePeriod', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-07-15T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns null for an already-expired date', () => {
      expect(computeRemainingGracePeriod('2026-07-15T11:00:00Z')).toBeNull()
    })

    it('returns null for an invalid date string', () => {
      expect(computeRemainingGracePeriod('not-a-date')).toBeNull()
    })

    it.each([
      ['2026-07-15T15:30:00Z', '3h 30m'],
      ['2026-07-15T14:00:00Z', '2h'],
      ['2026-07-15T12:45:00Z', '45m'],
    ])('formats remaining time for %s as %s', (expiry, expected) => {
      const result = computeRemainingGracePeriod(expiry)
      expect(result).not.toBeNull()
      expect(result!.remainingLabel).toBe(expected)
    })

    it('includes a formatted expiry string', () => {
      const result = computeRemainingGracePeriod('2026-07-15T15:30:00Z')!
      expect(result.expiryFormatted).toBeTruthy()
      expect(typeof result.expiryFormatted).toBe('string')
    })
  })
})
