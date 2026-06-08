import { describe, expect, it } from 'vitest'

import { PASSWORD_CHARACTER_CLASSES_MESSAGE, PASSWORD_MIN_LENGTH_MESSAGE } from './passwordComplexity'
import { COMPLIANT_TEST_PASSWORD } from './passwordComplexity.testFixtures'
import { userFormSchema, userCreateSchema } from './userFormSchema'

describe('userFormSchema', () => {
  const validData = {
    username: 'jdoe',
    email: 'jdoe@example.com',
    first_name: 'John',
    last_name: 'Doe',
    password: COMPLIANT_TEST_PASSWORD,
    is_enabled: true,
  }

  describe('valid data', () => {
    it('accepts valid user data', () => {
      const result = userFormSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })

    it('accepts empty password (edit mode)', () => {
      const result = userFormSchema.safeParse({ ...validData, password: '' })
      expect(result.success).toBe(true)
    })

    it('accepts undefined password (edit mode)', () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password: _, ...dataWithoutPassword } = validData
      const result = userFormSchema.safeParse(dataWithoutPassword)
      expect(result.success).toBe(true)
    })
  })

  describe('username validation', () => {
    it('rejects empty username', () => {
      const result = userFormSchema.safeParse({ ...validData, username: '' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Username is required')
      }
    })

    it('rejects username over 255 characters', () => {
      const result = userFormSchema.safeParse({ ...validData, username: 'a'.repeat(256) })
      expect(result.success).toBe(false)
    })
  })

  describe('name validation', () => {
    it('rejects empty first_name', () => {
      const result = userFormSchema.safeParse({ ...validData, first_name: '' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('First name is required')
      }
    })

    it('accepts empty last_name', () => {
      const result = userFormSchema.safeParse({ ...validData, last_name: '' })
      expect(result.success).toBe(true)
    })
  })

  describe('email validation', () => {
    it('accepts empty email (optional)', () => {
      const result = userFormSchema.safeParse({ ...validData, email: '' })
      expect(result.success).toBe(true)
    })

    it('accepts undefined email (optional)', () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { email: _, ...dataWithoutEmail } = validData
      const result = userFormSchema.safeParse(dataWithoutEmail)
      expect(result.success).toBe(true)
    })

    it('rejects invalid email', () => {
      const result = userFormSchema.safeParse({ ...validData, email: 'not-an-email' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Must be a valid email address')
      }
    })
  })

  describe('password validation', () => {
    it('rejects password shorter than 14 characters', () => {
      const result = userFormSchema.safeParse({ ...validData, password: 'short' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(PASSWORD_MIN_LENGTH_MESSAGE)
      }
    })

    it('rejects password with insufficient character classes', () => {
      const result = userFormSchema.safeParse({ ...validData, password: 'lowercaseonly123456' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(PASSWORD_CHARACTER_CLASSES_MESSAGE)
      }
    })
  })
})

describe('userCreateSchema', () => {
  const validData = {
    username: 'jdoe',
    email: 'jdoe@example.com',
    first_name: 'John',
    last_name: 'Doe',
    password: COMPLIANT_TEST_PASSWORD,
    is_enabled: true,
  }

  it('accepts valid create data with password', () => {
    const result = userCreateSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  it('rejects empty password on create', () => {
    const result = userCreateSchema.safeParse({ ...validData, password: '' })
    expect(result.success).toBe(false)
  })

  it('rejects missing password on create', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...dataWithoutPassword } = validData
    const result = userCreateSchema.safeParse(dataWithoutPassword)
    expect(result.success).toBe(false)
  })

  it('rejects short password on create', () => {
    const result = userCreateSchema.safeParse({ ...validData, password: 'short' })
    expect(result.success).toBe(false)
  })

  it('provides correct error message for missing password', () => {
    const result = userCreateSchema.safeParse({ ...validData, password: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const passwordError = result.error.issues.find((i) => i.path.includes('password'))
      expect(passwordError?.message).toBe('Password is required')
    }
  })
})
