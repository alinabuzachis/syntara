import { describe, expect, it } from 'vitest'

import { PROJECT_NAME_VALIDATION_MESSAGE, projectFormSchema } from './projectFormSchema'

describe('projectFormSchema', () => {
  describe('name validation', () => {
    it('accepts valid project names', () => {
      const validNames = [
        'project',
        'project-name',
        'project_name',
        'project-123',
        'my-project_v1',
        'project:name',
        'linux:team',
        'a', // single character
        '1', // single number
        'ABC123',
        'test-project-123',
      ]

      validNames.forEach((name) => {
        const result = projectFormSchema.safeParse({ name, description: null })
        expect(result.success, `"${name}" should be valid`).toBe(true)
      })
    })

    it('rejects names with spaces', () => {
      const result = projectFormSchema.safeParse({ name: 'linux team', description: null })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(PROJECT_NAME_VALIDATION_MESSAGE)
      }
    })

    it('rejects names starting with a hyphen', () => {
      const result = projectFormSchema.safeParse({ name: '-project', description: null })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('must start and end with a letter or number')
      }
    })

    it('rejects names ending with a hyphen', () => {
      const result = projectFormSchema.safeParse({ name: 'project-', description: null })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('must start and end with a letter or number')
      }
    })

    it('rejects names starting with an underscore', () => {
      const result = projectFormSchema.safeParse({ name: '_project', description: null })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('must start and end with a letter or number')
      }
    })

    it('rejects names ending with a colon', () => {
      const result = projectFormSchema.safeParse({ name: 'project:', description: null })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(PROJECT_NAME_VALIDATION_MESSAGE)
      }
    })

    it('rejects names with special characters', () => {
      const invalidNames = [
        'project@test',
        'project#test',
        'project$test',
        'project%test',
        'project&test',
        'project*test',
        'project.test',
        'project/test',
      ]

      invalidNames.forEach((name) => {
        const result = projectFormSchema.safeParse({ name, description: null })
        expect(result.success, `"${name}" should be invalid`).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain(
            'can only contain letters, numbers, hyphens, underscores, or colons'
          )
        }
      })
    })

    it('requires name to be non-empty', () => {
      const result = projectFormSchema.safeParse({ name: '', description: null })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Project name is required')
      }
    })

    it('enforces max length of 255 characters', () => {
      const longName = 'a'.repeat(256)
      const result = projectFormSchema.safeParse({ name: longName, description: null })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Project name must be 255 characters or fewer')
      }
    })
  })

  describe('description validation', () => {
    it('accepts descriptions up to 2000 characters', () => {
      const validDescription = 'a'.repeat(2000)
      const result = projectFormSchema.safeParse({ name: 'test', description: validDescription })

      expect(result.success).toBe(true)
    })

    it('rejects descriptions over 2000 characters', () => {
      const longDescription = 'a'.repeat(2001)
      const result = projectFormSchema.safeParse({ name: 'test', description: longDescription })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Description must be 2000 characters or fewer')
      }
    })

    it('accepts null description', () => {
      const result = projectFormSchema.safeParse({ name: 'test', description: null })

      expect(result.success).toBe(true)
    })

    it('accepts undefined description', () => {
      const result = projectFormSchema.safeParse({ name: 'test' })

      expect(result.success).toBe(true)
    })
  })
})
