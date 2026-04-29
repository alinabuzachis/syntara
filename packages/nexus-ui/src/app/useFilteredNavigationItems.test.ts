import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useSettingsPermissions } from '../routes/configuration/settings/useSettingsPermissions'

import { AppRoute } from './AppRoute'
import { navigationItems } from './navigationItems'
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

    expect(result.current).toBe(navigationItems)
  })

  it('filters out Settings nav item when user cannot read settings', () => {
    vi.mocked(useSettingsPermissions).mockReturnValue({ canRead: false, canWrite: false })

    const { result } = renderHook(() => useFilteredNavigationItems())

    const configGroup = result.current.find((item) =>
      item.children?.some((child) => child.path === AppRoute.Configuration.Settings)
    )
    expect(configGroup).toBeUndefined()
  })

  it('preserves other Configuration children when Settings is filtered', () => {
    vi.mocked(useSettingsPermissions).mockReturnValue({ canRead: false, canWrite: false })

    const { result } = renderHook(() => useFilteredNavigationItems())

    const configGroup = result.current.find((item) => item.label === 'Configuration')
    expect(configGroup?.children).toBeDefined()
    expect(configGroup!.children!.length).toBeGreaterThan(0)
    expect(configGroup!.children!.every((child) => child.path !== AppRoute.Configuration.Settings)).toBe(true)
  })

  it('does not modify items without children', () => {
    vi.mocked(useSettingsPermissions).mockReturnValue({ canRead: false, canWrite: false })

    const { result } = renderHook(() => useFilteredNavigationItems())

    const topLevelWithoutChildren = navigationItems.filter((item) => !item.children)
    const filteredTopLevel = result.current.filter((item) => !item.children)
    expect(filteredTopLevel).toEqual(topLevelWithoutChildren)
  })
})
