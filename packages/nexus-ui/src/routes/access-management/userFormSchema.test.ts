import { describe, expect, it } from 'vitest'

import { splitFullName, toFullName, userFormSchema, userCreateSchema } from './userFormSchema'

describe('userFormSchema', () => {
  const validData = {
    username: 'jdoe',
    email: 'jdoe@example.com',
    first_name: 'John',
    last_name: 'Doe',
    password: 'securepass123',
    is_active: true,
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

    it('rejects empty last_name', () => {
      const result = userFormSchema.safeParse({ ...validData, last_name: '' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Last name is required')
      }
    })
  })

  describe('email validation', () => {
    it('rejects empty email', () => {
      const result = userFormSchema.safeParse({ ...validData, email: '' })
      expect(result.success).toBe(false)
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
    it('rejects password shorter than 8 characters', () => {
      const result = userFormSchema.safeParse({ ...validData, password: 'short' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Password must be at least 8 characters')
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
    password: 'securepass123',
    is_active: true,
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
      expect(passwordError?.message).toBe('Password is required (min 8 characters)')
    }
  })
})

describe('toFullName', () => {
  it('joins first and last name', () => {
    expect(toFullName('John', 'Doe')).toBe('John Doe')
  })

  it('handles empty last name', () => {
    expect(toFullName('John', '')).toBe('John')
  })
})

describe('splitFullName', () => {
  it('splits first and last name', () => {
    expect(splitFullName('John Doe')).toEqual({ first_name: 'John', last_name: 'Doe' })
  })

  it('handles single name', () => {
    expect(splitFullName('John')).toEqual({ first_name: 'John', last_name: '' })
  })

  it('handles multiple spaces in last name', () => {
    expect(splitFullName('John van Doe')).toEqual({ first_name: 'John', last_name: 'van Doe' })
  })

  it('handles empty string', () => {
    expect(splitFullName('')).toEqual({ first_name: '', last_name: '' })
  })
})
