import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useAccessManagementPermissions } from '../routes/access-management/useAccessManagementPermissions'
import { useSettingsPermissions } from '../routes/configuration/settings/useSettingsPermissions'

import { AppRoute } from './AppRoute'
import { NAV_ITEMS } from './navigationItems'
import { useFilteredNavigationItems } from './useFilteredNavigationItems'

vi.mock('../routes/configuration/settings/useSettingsPermissions', () => ({
  useSettingsPermissions: vi.fn(),
}))

vi.mock('../routes/access-management/useAccessManagementPermissions', () => ({
  useAccessManagementPermissions: vi.fn(),
}))

describe('useFilteredNavigationItems', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useSettingsPermissions).mockReturnValue({ canRead: true, canWrite: true })
    vi.mocked(useAccessManagementPermissions).mockReturnValue({
      canReadUsers: true,
      canReadGroups: true,
      isLoading: false,
    })
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

  it('filters out Users tab when user cannot read users', () => {
    vi.mocked(useSettingsPermissions).mockReturnValue({ canRead: true, canWrite: true })
    vi.mocked(useAccessManagementPermissions).mockReturnValue({
      canReadUsers: false,
      canReadGroups: true,
      isLoading: false,
    })

    const { result } = renderHook(() => useFilteredNavigationItems())

    const sysAdmin = result.current.find((item) => item.path === AppRoute.SystemAdministration.Root)
    const accessGroup = sysAdmin?.children?.find((child) => child.path === AppRoute.AccessManagement.Root)
    const { children: accessChildren } = accessGroup ?? {}
    expect(accessChildren?.some((child) => child.path === AppRoute.AccessManagement.Users)).toBe(false)
    expect(accessChildren?.some((child) => child.path === AppRoute.AccessManagement.Groups)).toBe(true)
  })

  it('filters out Groups tab when user cannot read groups', () => {
    vi.mocked(useAccessManagementPermissions).mockReturnValue({
      canReadUsers: true,
      canReadGroups: false,
      isLoading: false,
    })

    const { result } = renderHook(() => useFilteredNavigationItems())

    const sysAdmin = result.current.find((item) => item.path === AppRoute.SystemAdministration.Root)
    const accessGroup = sysAdmin?.children?.find((child) => child.path === AppRoute.AccessManagement.Root)
    const { children: accessChildren } = accessGroup ?? {}
    expect(accessChildren?.some((child) => child.path === AppRoute.AccessManagement.Users)).toBe(true)
    expect(accessChildren?.some((child) => child.path === AppRoute.AccessManagement.Groups)).toBe(false)
  })

  it('filters out both Users and Groups when user cannot read either', () => {
    vi.mocked(useAccessManagementPermissions).mockReturnValue({
      canReadUsers: false,
      canReadGroups: false,
      isLoading: false,
    })

    const { result } = renderHook(() => useFilteredNavigationItems())

    const sysAdmin = result.current.find((item) => item.path === AppRoute.SystemAdministration.Root)
    const accessGroup = sysAdmin?.children?.find((child) => child.path === AppRoute.AccessManagement.Root)
    const { children: accessChildren } = accessGroup ?? {}
    expect(accessChildren?.some((child) => child.path === AppRoute.AccessManagement.Users)).toBe(false)
    expect(accessChildren?.some((child) => child.path === AppRoute.AccessManagement.Groups)).toBe(false)
  })
})
