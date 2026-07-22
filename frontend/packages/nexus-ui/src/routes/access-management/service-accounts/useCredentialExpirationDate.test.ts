import { act, renderHook } from '@testing-library/react'
import { addDays, startOfDay } from 'date-fns'
import { describe, expect, it } from 'vitest'

import { formatDateYMD } from '../../../utils/dateUtils'

import { useCredentialExpirationDate } from './useCredentialExpirationDate'

const today = startOfDay(new Date())
const tomorrow = addDays(today, 1)

describe('useCredentialExpirationDate', () => {
  describe('default behavior (no maxLifetimeDays)', () => {
    it('defaults to 180-day max lifetime', () => {
      const { result } = renderHook(() => useCredentialExpirationDate())
      const expectedMax = addDays(today, 179)
      expect(result.current.value).toBe(formatDateYMD(expectedMax))
    })

    it('starts with no error', () => {
      const { result } = renderHook(() => useCredentialExpirationDate())
      expect(result.current.error).toBe('')
    })

    it('provides helper text with max lifetime info', () => {
      const { result } = renderHook(() => useCredentialExpirationDate())
      expect(result.current.helperText).toContain('180 days')
    })
  })

  describe('custom maxLifetimeDays', () => {
    it('uses the provided max lifetime', () => {
      const { result } = renderHook(() => useCredentialExpirationDate(30))
      const expectedMax = addDays(today, 29)
      expect(result.current.value).toBe(formatDateYMD(expectedMax))
      expect(result.current.helperText).toContain('30 days')
    })

    it('enforces minimum of 1 day for maxDate', () => {
      const { result } = renderHook(() => useCredentialExpirationDate(0))
      const expectedMax = addDays(today, 1)
      expect(result.current.value).toBe(formatDateYMD(expectedMax))
    })
  })

  describe('unlimited mode (maxLifetimeDays = -1)', () => {
    it('defaults to 365 days in the future', () => {
      const { result } = renderHook(() => useCredentialExpirationDate(-1))
      const expected365 = addDays(today, 365)
      expect(result.current.value).toBe(formatDateYMD(expected365))
    })

    it('shows unlimited helper text', () => {
      const { result } = renderHook(() => useCredentialExpirationDate(-1))
      expect(result.current.helperText).toBe('No maximum lifetime configured')
    })
  })

  describe('validator', () => {
    it('rejects dates in the past', () => {
      const { result } = renderHook(() => useCredentialExpirationDate())
      const yesterday = addDays(today, -1)
      expect(result.current.validator(yesterday)).toBe('Date must be in the future')
    })

    it('rejects today (must be at least tomorrow)', () => {
      const { result } = renderHook(() => useCredentialExpirationDate())
      expect(result.current.validator(today)).toBe('Date must be in the future')
    })

    it('accepts tomorrow', () => {
      const { result } = renderHook(() => useCredentialExpirationDate())
      expect(result.current.validator(tomorrow)).toBe('')
    })

    it('rejects dates beyond max lifetime', () => {
      const { result } = renderHook(() => useCredentialExpirationDate(30))
      const tooFar = addDays(today, 31)
      expect(result.current.validator(tooFar)).toBe('Date exceeds maximum credential lifetime')
    })

    it('accepts dates within max lifetime', () => {
      const { result } = renderHook(() => useCredentialExpirationDate(30))
      const withinRange = addDays(today, 15)
      expect(result.current.validator(withinRange)).toBe('')
    })

    it('allows any future date in unlimited mode', () => {
      const { result } = renderHook(() => useCredentialExpirationDate(-1))
      const farFuture = addDays(today, 1000)
      expect(result.current.validator(farFuture)).toBe('')
    })
  })

  describe('handleChange', () => {
    it('updates value on valid date change', () => {
      const { result } = renderHook(() => useCredentialExpirationDate())
      const validDate = addDays(today, 10)

      act(() => {
        result.current.handleChange({} as React.FormEvent<HTMLInputElement>, formatDateYMD(validDate), validDate)
      })

      expect(result.current.value).toBe(formatDateYMD(validDate))
      expect(result.current.error).toBe('')
    })

    it('sets error for invalid date format (text entered but no dateValue)', () => {
      const { result } = renderHook(() => useCredentialExpirationDate())

      act(() => {
        result.current.handleChange({} as React.FormEvent<HTMLInputElement>, 'not-a-date', undefined)
      })

      expect(result.current.error).toBe('Invalid date format')
    })

    it('clears error when input is emptied', () => {
      const { result } = renderHook(() => useCredentialExpirationDate())

      act(() => {
        result.current.handleChange({} as React.FormEvent<HTMLInputElement>, 'bad', undefined)
      })
      expect(result.current.error).toBe('Invalid date format')

      act(() => {
        result.current.handleChange({} as React.FormEvent<HTMLInputElement>, '', undefined)
      })
      expect(result.current.error).toBe('')
    })

    it('sets error when date is out of range', () => {
      const { result } = renderHook(() => useCredentialExpirationDate(30))
      const tooFar = addDays(today, 31)

      act(() => {
        result.current.handleChange({} as React.FormEvent<HTMLInputElement>, formatDateYMD(tooFar), tooFar)
      })

      expect(result.current.error).toBe('Date exceeds maximum credential lifetime')
    })
  })
})
