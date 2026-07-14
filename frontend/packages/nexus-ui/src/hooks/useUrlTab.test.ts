import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'

import { routerTestState } from '../test/setup'

import { useUrlTab } from './useUrlTab'

describe('useUrlTab', () => {
  beforeEach(() => {
    routerTestState.pathname = '/'
    routerTestState.navigate.mockClear()
  })

  it('should return default tab when URL has no trailing segment', () => {
    routerTestState.pathname = '/system-administration/access-management/users/123'
    const { result } = renderHook(() => useUrlTab('/system-administration/access-management/users/123'))

    expect(result.current[0]).toBe('details')
  })

  it('should return custom default tab when specified', () => {
    routerTestState.pathname = '/access/can-i'
    const { result } = renderHook(() => useUrlTab('/access/can-i', 'check'))

    expect(result.current[0]).toBe('check')
  })

  it('should parse tab slug from URL path', () => {
    routerTestState.pathname = '/system-administration/access-management/users/123/groups'
    const { result } = renderHook(() => useUrlTab('/system-administration/access-management/users/123'))

    expect(result.current[0]).toBe('groups')
  })

  it('should parse tab slug with trailing slash', () => {
    routerTestState.pathname = '/system-administration/access-management/users/123/roles/'
    const { result } = renderHook(() => useUrlTab('/system-administration/access-management/users/123'))

    expect(result.current[0]).toBe('roles')
  })

  it('should call navigate with correct path when goToTab is called', () => {
    routerTestState.pathname = '/system-administration/access-management/users/123/details'
    const { result } = renderHook(() => useUrlTab('/system-administration/access-management/users/123'))

    act(() => {
      result.current[1]('groups')
    })

    expect(routerTestState.navigate).toHaveBeenCalledWith({
      to: '/system-administration/access-management/users/123/groups',
    })
  })

  it('should return default tab when location does not start with basePath', () => {
    routerTestState.pathname = '/other/path'
    const { result } = renderHook(() => useUrlTab('/system-administration/access-management/users/123'))

    expect(result.current[0]).toBe('details')
  })

  it('should handle exact basePath match with no trailing content', () => {
    routerTestState.pathname = '/access/can-i'
    const { result } = renderHook(() => useUrlTab('/access/can-i', 'check'))

    expect(result.current[0]).toBe('check')
  })
})
