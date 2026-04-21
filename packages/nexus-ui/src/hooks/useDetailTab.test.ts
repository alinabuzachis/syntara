import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { useDetailTab } from './useDetailTab'

const mockSetLocation = vi.fn()
let mockLocation = '/'

vi.mock('wouter', () => ({
  useLocation: () => [mockLocation, mockSetLocation],
}))

describe('useDetailTab', () => {
  beforeEach(() => {
    mockLocation = '/'
    mockSetLocation.mockClear()
  })

  it('should return default tab when URL has no trailing segment', () => {
    mockLocation = '/access-management/users/123'
    const { result } = renderHook(() => useDetailTab('/access-management/users/123'))

    expect(result.current[0]).toBe('details')
  })

  it('should return custom default tab when specified', () => {
    mockLocation = '/access/can-i'
    const { result } = renderHook(() => useDetailTab('/access/can-i', 'check'))

    expect(result.current[0]).toBe('check')
  })

  it('should parse tab slug from URL path', () => {
    mockLocation = '/access-management/users/123/groups'
    const { result } = renderHook(() => useDetailTab('/access-management/users/123'))

    expect(result.current[0]).toBe('groups')
  })

  it('should parse tab slug with trailing slash', () => {
    mockLocation = '/access-management/users/123/roles/'
    const { result } = renderHook(() => useDetailTab('/access-management/users/123'))

    expect(result.current[0]).toBe('roles')
  })

  it('should call setLocation with correct path when goToTab is called', () => {
    mockLocation = '/access-management/users/123/details'
    const { result } = renderHook(() => useDetailTab('/access-management/users/123'))

    act(() => {
      result.current[1]('groups')
    })

    expect(mockSetLocation).toHaveBeenCalledWith('/access-management/users/123/groups')
  })

  it('should return default tab when location does not start with basePath', () => {
    mockLocation = '/other/path'
    const { result } = renderHook(() => useDetailTab('/access-management/users/123'))

    expect(result.current[0]).toBe('details')
  })

  it('should handle exact basePath match with no trailing content', () => {
    mockLocation = '/access/can-i'
    const { result } = renderHook(() => useDetailTab('/access/can-i', 'check'))

    expect(result.current[0]).toBe('check')
  })
})
