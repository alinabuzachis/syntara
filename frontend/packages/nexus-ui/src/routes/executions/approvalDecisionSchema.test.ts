import { approvalDecisionSchema } from './approvalDecisionSchema'

describe('approvalDecisionSchema', () => {
  it('accepts valid approved decision with notes', () => {
    const result = approvalDecisionSchema.safeParse({
      status: 'approved',
      notes: 'Looks good to proceed',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('approved')
      expect(result.data.notes).toBe('Looks good to proceed')
    }
  })

  it('accepts valid rejected decision with notes', () => {
    const result = approvalDecisionSchema.safeParse({
      status: 'rejected',
      notes: 'Does not meet requirements',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('rejected')
    }
  })

  it('accepts empty notes', () => {
    const result = approvalDecisionSchema.safeParse({
      status: 'approved',
      notes: '',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.notes).toBe('')
    }
  })

  it('rejects missing notes field', () => {
    const result = approvalDecisionSchema.safeParse({
      status: 'approved',
    })

    expect(result.success).toBe(false)
  })

  it('rejects invalid status value', () => {
    const result = approvalDecisionSchema.safeParse({
      status: 'pending',
      notes: 'Some notes',
    })

    expect(result.success).toBe(false)
  })

  it('rejects notes exceeding 2000 characters', () => {
    const result = approvalDecisionSchema.safeParse({
      status: 'approved',
      notes: 'a'.repeat(2001),
    })

    expect(result.success).toBe(false)
  })

  it('accepts notes at exactly 2000 characters', () => {
    const result = approvalDecisionSchema.safeParse({
      status: 'approved',
      notes: 'a'.repeat(2000),
    })

    expect(result.success).toBe(true)
  })
})
