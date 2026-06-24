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

/** All permission keys used by nav items — defaults to all granted */
function setPermissions(overrides: Record<string, boolean>) {
  mockUsePermissionChecks.mockReturnValue({
    permissions: {
      'setting:read': true,
      'user:read': true,
      'group:read': true,
      'identity-provider:read': true,
      'project:read': true,
      'role-assignment:read': true,
      'approval:read': true,
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
    expect(findItem(result.current, 'Identity Providers')).toBeDefined()
    expect(findItem(result.current, 'Access Management')).toBeDefined()
  })

  it('excludes Settings when setting:read is denied', () => {
    setPermissions({ 'setting:read': false })
    const { result } = renderHook(() => useFilteredNavigationItems())

    expect(findItem(result.current, 'Settings')).toBeUndefined()
    expect(findItem(result.current, 'Users')).toBeDefined()
    expect(findItem(result.current, 'Groups')).toBeDefined()
  })

  it('always includes items without requiredPermissions', () => {
    setPermissions({
      'setting:read': false,
      'user:read': false,
      'group:read': false,
      'identity-provider:read': false,
      'project:read': false,
      'role-assignment:read': false,
      'approval:read': true, // Approvals now requires approval:read permission
    })
    const { result } = renderHook(() => useFilteredNavigationItems())

    expect(findItem(result.current, 'Workflows')).toBeDefined()
    expect(findItem(result.current, 'Approvals')).toBeDefined()
    expect(findItem(result.current, 'Workflow Runs')).toBeDefined()
  })

  it('excludes Approvals when approval:read is denied', () => {
    setPermissions({ 'approval:read': false })
    const { result } = renderHook(() => useFilteredNavigationItems())

    expect(findItem(result.current, 'Approvals')).toBeUndefined()
    expect(findItem(result.current, 'Workflows')).toBeDefined()
    expect(findItem(result.current, 'Workflow Runs')).toBeDefined()
  })

  it('excludes Identity Providers when identity-provider:read is denied', () => {
    setPermissions({ 'identity-provider:read': false })
    const { result } = renderHook(() => useFilteredNavigationItems())

    expect(findItem(result.current, 'Identity Providers')).toBeUndefined()
    expect(findItem(result.current, 'Settings')).toBeDefined()
  })

  it('preserves other System Administration children when Settings is filtered', () => {
    setPermissions({ 'setting:read': false })
    const { result } = renderHook(() => useFilteredNavigationItems())

    expect(findItem(result.current, 'Access Management')).toBeDefined()
    expect(findItem(result.current, 'Identity Providers')).toBeDefined()
    expect(findItem(result.current, 'Settings')).toBeUndefined()
  })

  describe('Access Management section-level gating', () => {
    it('shows Access Management when at least one AM permission is granted', () => {
      setPermissions({
        'user:read': false,
        'group:read': false,
        'project:read': true,
        'role-assignment:read': false,
      })
      const { result } = renderHook(() => useFilteredNavigationItems())

      expect(findItem(result.current, 'Access Management')).toBeDefined()
    })

    it('hides Access Management when all AM permissions are denied', () => {
      setPermissions({
        'user:read': false,
        'group:read': false,
        'project:read': false,
        'role-assignment:read': false,
      })
      const { result } = renderHook(() => useFilteredNavigationItems())

      expect(findItem(result.current, 'Access Management')).toBeUndefined()
    })
  })

  describe('Access Management tab gating', () => {
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

  describe('section-level hiding', () => {
    it('hides System Administration when all children are denied', () => {
      setPermissions({
        'setting:read': false,
        'identity-provider:read': false,
        'user:read': false,
        'group:read': false,
        'project:read': false,
        'role-assignment:read': false,
      })
      const { result } = renderHook(() => useFilteredNavigationItems())

      expect(findItem(result.current, 'System Administration')).toBeUndefined()
    })

    it('keeps System Administration when at least one child is visible', () => {
      setPermissions({
        'setting:read': true,
        'identity-provider:read': false,
        'user:read': false,
        'group:read': false,
        'project:read': false,
        'role-assignment:read': false,
      })
      const { result } = renderHook(() => useFilteredNavigationItems())

      expect(findItem(result.current, 'System Administration')).toBeDefined()
      expect(findItem(result.current, 'Settings')).toBeDefined()
    })

    it('keeps Configuration visible (no permission-gated children)', () => {
      setPermissions({
        'setting:read': false,
        'identity-provider:read': false,
        'user:read': false,
        'group:read': false,
        'project:read': false,
        'role-assignment:read': false,
      })
      const { result } = renderHook(() => useFilteredNavigationItems())

      expect(findItem(result.current, 'Configuration')).toBeDefined()
      expect(findItem(result.current, 'Integrations')).toBeDefined()
      expect(findItem(result.current, 'Credentials')).toBeDefined()
    })
  })
})
