import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { usePermissionChecks as UsePermissionChecksFn } from '../hooks/usePermissionChecks'

import { useFilteredNavigationItems } from './useFilteredNavigationItems'

const mockUsePermissionChecks = vi.fn<typeof UsePermissionChecksFn>()

vi.mock('../hooks/usePermissionChecks', () => ({
  usePermissionChecks: (...args: Parameters<typeof UsePermissionChecksFn>) => mockUsePermissionChecks(...args),
}))

vi.mock('../client', () => ({
  authMiddleware: { onRequest: vi.fn() },
}))

vi.mock('../routes/access/accessClient', () => ({
  accessFetchClient: {
    POST: vi.fn(),
    use: vi.fn(),
  },
}))

/** Helper: find a nav item by label at any depth */
function findItem(
  items: readonly { label: string; children?: readonly { label: string }[] }[],
  label: string
): { label: string } | undefined {
  for (const item of items) {
    if (item.label === label) return item
    if (item.children) {
      // eslint-disable-next-line testing-library/no-node-access -- .children is a TNavigationItem property, not DOM node access
      const found = findItem(item.children, label)
      if (found) return found
    }
  }
  return undefined
}

function setPermissions(overrides: Record<string, boolean>) {
  mockUsePermissionChecks.mockReturnValue({
    permissions: {
      'setting:read': true,
      'user:read': true,
      'group:read': true,
      ...overrides,
    },
    isLoading: false,
  })
}

describe('useFilteredNavigationItems', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setPermissions({})
  })

  it('includes all gated items when all permissions are allowed', () => {
    setPermissions({})
    const { result } = renderHook(() => useFilteredNavigationItems())

    expect(findItem(result.current, 'Settings')).toBeDefined()
    expect(findItem(result.current, 'Users')).toBeDefined()
    expect(findItem(result.current, 'Groups')).toBeDefined()
  })

  it('excludes Settings when setting:read is denied', () => {
    setPermissions({ 'setting:read': false })
    const { result } = renderHook(() => useFilteredNavigationItems())

    expect(findItem(result.current, 'Settings')).toBeUndefined()
    expect(findItem(result.current, 'Users')).toBeDefined()
    expect(findItem(result.current, 'Groups')).toBeDefined()
  })

  it('always includes items without requiredPermissions', () => {
    setPermissions({ 'setting:read': false, 'user:read': false, 'group:read': false })
    const { result } = renderHook(() => useFilteredNavigationItems())

    expect(findItem(result.current, 'Workflows')).toBeDefined()
    expect(findItem(result.current, 'Approvals')).toBeDefined()
    expect(findItem(result.current, 'Audit Log')).toBeDefined()
  })

  it('hides all gated items when all permissions are denied', () => {
    setPermissions({ 'setting:read': false, 'user:read': false, 'group:read': false })
    const { result } = renderHook(() => useFilteredNavigationItems())

    expect(findItem(result.current, 'Settings')).toBeUndefined()
    expect(findItem(result.current, 'Users')).toBeUndefined()
    expect(findItem(result.current, 'Groups')).toBeUndefined()
  })

  it('preserves other System Administration children when Settings is filtered', () => {
    setPermissions({ 'setting:read': false })
    const { result } = renderHook(() => useFilteredNavigationItems())

    expect(findItem(result.current, 'Access Management')).toBeDefined()
    expect(findItem(result.current, 'Identity Providers')).toBeDefined()
    expect(findItem(result.current, 'Settings')).toBeUndefined()
  })

  it('filters out Users tab when user:read is denied', () => {
    setPermissions({ 'user:read': false })
    const { result } = renderHook(() => useFilteredNavigationItems())

    expect(findItem(result.current, 'Users')).toBeUndefined()
    expect(findItem(result.current, 'Groups')).toBeDefined()
  })

  it('filters out Groups tab when group:read is denied', () => {
    setPermissions({ 'group:read': false })
    const { result } = renderHook(() => useFilteredNavigationItems())

    expect(findItem(result.current, 'Users')).toBeDefined()
    expect(findItem(result.current, 'Groups')).toBeUndefined()
  })

  it('filters out both Users and Groups when both are denied', () => {
    setPermissions({ 'user:read': false, 'group:read': false })
    const { result } = renderHook(() => useFilteredNavigationItems())

    expect(findItem(result.current, 'Users')).toBeUndefined()
    expect(findItem(result.current, 'Groups')).toBeUndefined()
  })
})
