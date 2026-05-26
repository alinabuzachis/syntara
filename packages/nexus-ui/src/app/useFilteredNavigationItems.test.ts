import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useSettingsPermissions } from '../routes/configuration/settings/useSettingsPermissions'

import { AppRoute } from './AppRoute'
import { NAV_ITEMS } from './navigationItems'
import { useFilteredNavigationItems } from './useFilteredNavigationItems'

vi.mock('../routes/configuration/settings/useSettingsPermissions', () => ({
  useSettingsPermissions: vi.fn(),
}))

describe('useFilteredNavigationItems', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useSettingsPermissions).mockReturnValue({ canRead: true, canWrite: true })
  })

  it('returns all navigation items when user can read settings', () => {
    vi.mocked(useSettingsPermissions).mockReturnValue({ canRead: true, canWrite: true })

    const { result } = renderHook(() => useFilteredNavigationItems())

    expect(result.current).toBe(NAV_ITEMS)
  })

  it('filters out Settings nav item when user cannot read settings', () => {
    vi.mocked(useSettingsPermissions).mockReturnValue({ canRead: false, canWrite: false })

    const { result } = renderHook(() => useFilteredNavigationItems())

    const sysAdminGroup = result.current.find((item) => item.label === 'System Administration')
    expect(sysAdminGroup?.children?.some((child) => child.path === AppRoute.SystemAdministration.Settings)).toBe(false)
  })

  it('preserves other System Administration children when Settings is filtered', () => {
    vi.mocked(useSettingsPermissions).mockReturnValue({ canRead: false, canWrite: false })

    const { result } = renderHook(() => useFilteredNavigationItems())

    const sysAdminGroup = result.current.find((item) => item.label === 'System Administration')
    // testing-library/no-node-access flags any `.children` property access regardless of
    // whether it is a DOM node or a plain data object. Destructure to satisfy the rule.
    const { children: sysAdminChildren } = sysAdminGroup ?? {}
    expect(sysAdminChildren).toBeDefined()
    expect(sysAdminChildren!.length).toBeGreaterThan(0)
    expect(sysAdminChildren!.every((child) => child.path !== AppRoute.SystemAdministration.Settings)).toBe(true)
  })

  it('does not modify items without children', () => {
    vi.mocked(useSettingsPermissions).mockReturnValue({ canRead: false, canWrite: false })

    const { result } = renderHook(() => useFilteredNavigationItems())

    const topLevelWithoutChildren = NAV_ITEMS.filter(({ children }) => !children)
    const filteredTopLevel = result.current.filter(({ children }) => !children)
    expect(filteredTopLevel).toEqual(topLevelWithoutChildren)
  })
})
