import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { invalidateAuthzCaches } from './invalidateAuthzCaches'

describe('invalidateAuthzCaches', () => {
  it('invalidates can_i and what_can_i query keys', () => {
    const queryClient = new QueryClient()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')

    invalidateAuthzCaches(queryClient)

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['authz', 'can_i'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['all-permissions'] })
    expect(invalidateQueries).toHaveBeenCalledTimes(2)
  })
})
