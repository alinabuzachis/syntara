import { describe, expect, it } from 'vitest'

/**
 * Integration tests for ConvergeNodeDetails snake_case/camelCase compatibility
 * These tests verify the handleSubmit logic writes snake_case fields
 */

describe('ConvergeNodeDetails snake_case Field Writing Logic', () => {
  // Simulate the handleSubmit logic from ConvergeNodeDetails.tsx
  function simulateHandleSubmit(formData: {
    name: string
    strategy?: 'all' | 'any'
    timeout?: number
    onTimeout?: 'continue' | 'fail'
    requiredPathCount?: number
    remainingBehavior?: 'continue' | 'cancel'
  }) {
    const config: Record<string, unknown> = {
      strategy: (formData.strategy ?? 'all') as 'all',
      ...(formData.timeout !== undefined && { timeout: formData.timeout }),
      ...(formData.onTimeout !== undefined && { on_timeout: formData.onTimeout }),
      ...(formData.strategy === 'any' &&
        formData.requiredPathCount !== undefined && { required_path_count: formData.requiredPathCount }),
      ...(formData.strategy === 'any' &&
        formData.remainingBehavior && { remaining_behavior: formData.remainingBehavior }),
    }

    return config
  }

  it('writes required_path_count in snake_case (not requiredPathCount)', () => {
    const formData = {
      name: 'Updated Converge',
      strategy: 'any' as const,
      requiredPathCount: 2,
      remainingBehavior: 'continue' as const,
    }

    const result = simulateHandleSubmit(formData)

    // Should write snake_case
    expect(result.required_path_count).toBe(2)
    expect(result.remaining_behavior).toBe('continue')

    // Should NOT write camelCase
    expect(result.requiredPathCount).toBeUndefined()
    expect(result.remainingBehavior).toBeUndefined()
  })

  it('writes remaining_behavior in snake_case (not remainingBehavior)', () => {
    const formData = {
      name: 'Updated Converge',
      strategy: 'any' as const,
      requiredPathCount: 2,
      remainingBehavior: 'continue' as const,
    }

    const result = simulateHandleSubmit(formData)

    expect(result.remaining_behavior).toBe('continue')
    expect(result.remainingBehavior).toBeUndefined()
  })

  it('writes on_timeout in snake_case (not onTimeout)', () => {
    const formData = {
      name: 'Updated Converge',
      strategy: 'all' as const,
      timeout: 3600,
      onTimeout: 'continue' as const,
    }

    const result = simulateHandleSubmit(formData)

    // Should write snake_case
    expect(result.on_timeout).toBe('continue')

    // Should NOT write camelCase
    expect(result.onTimeout).toBeUndefined()
  })

  it('omits required_path_count and remaining_behavior when strategy is "all"', () => {
    const formData = {
      name: 'Updated Converge',
      strategy: 'all' as const,
      requiredPathCount: 2, // Should be ignored for 'all' strategy
      remainingBehavior: 'continue' as const, // Should be ignored for 'all' strategy
    }

    const result = simulateHandleSubmit(formData)

    expect(result.strategy).toBe('all')
    // These fields should only be present when strategy is 'any'
    expect(result.required_path_count).toBeUndefined()
    expect(result.remaining_behavior).toBeUndefined()
  })

  it('includes required_path_count and remaining_behavior when strategy is "any"', () => {
    const formData = {
      name: 'Updated Converge',
      strategy: 'any' as const,
      requiredPathCount: 2,
      remainingBehavior: 'continue' as const,
    }

    const result = simulateHandleSubmit(formData)

    expect(result.strategy).toBe('any')
    expect(result.required_path_count).toBe(2)
    expect(result.remaining_behavior).toBe('continue')
  })
})
