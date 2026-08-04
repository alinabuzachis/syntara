import { describe, expect, it } from 'vitest'

import {
  getPasswordComplexityError,
  MIN_USER_PASSWORD_LENGTH,
  PASSWORD_CHARACTER_CLASSES_MESSAGE,
  PASSWORD_MIN_LENGTH_MESSAGE,
} from './passwordComplexity'
import { COMPLIANT_TEST_PASSWORD } from './passwordComplexity.testFixtures'

describe('getPasswordComplexityError', () => {
  it('returns undefined for a compliant password', () => {
    expect(getPasswordComplexityError(COMPLIANT_TEST_PASSWORD)).toBeUndefined()
  })

  it('rejects passwords shorter than minimum length', () => {
    expect(getPasswordComplexityError('Short123!')).toBe(PASSWORD_MIN_LENGTH_MESSAGE)
  })

  it('rejects passwords with only one character class', () => {
    expect(getPasswordComplexityError('lowercasepasswordonly')).toBe(PASSWORD_CHARACTER_CLASSES_MESSAGE)
  })

  it('rejects passwords with only two character classes', () => {
    expect(getPasswordComplexityError('lowercaseonly123456')).toBe(PASSWORD_CHARACTER_CLASSES_MESSAGE)
  })

  it('accepts passwords with three character classes', () => {
    expect(getPasswordComplexityError('ValidPassword123')).toBeUndefined()
  })

  it('accepts exactly minimum length with three classes', () => {
    expect(getPasswordComplexityError('ValidPass123!!')).toBeUndefined()
    expect('ValidPass123!!'.length).toBe(MIN_USER_PASSWORD_LENGTH)
  })
})
