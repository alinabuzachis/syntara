import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useSettingsPermissions } from '../routes/configuration/settings/useSettingsPermissions'

import { AppRoute } from './AppRoute'
import { NAV_ITEMS } from './navigationItems'
import { useFilteredNavigationItems } from './useFilteredNavigationItems'

vi.mock('../routes/configuration/settings/useSettingsPermissions', () => ({
  useSettingsPermissions: vi.fn().mockReturnValue({ canRead: true, canWrite: true }),
}))

describe('useFilteredNavigationItems', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    expect(sysAdminGroup?.children).toBeDefined()
    expect(sysAdminGroup!.children!.length).toBeGreaterThan(0)
    expect(sysAdminGroup!.children!.every((child) => child.path !== AppRoute.SystemAdministration.Settings)).toBe(true)
  })

  it('does not modify items without children', () => {
    vi.mocked(useSettingsPermissions).mockReturnValue({ canRead: false, canWrite: false })

    const { result } = renderHook(() => useFilteredNavigationItems())

    const topLevelWithoutChildren = NAV_ITEMS.filter((item) => !item.children)
    const filteredTopLevel = result.current.filter((item) => !item.children)
    expect(filteredTopLevel).toEqual(topLevelWithoutChildren)
  })
})
