import { useMemo } from 'react'

import { useAccessManagementPermissions } from '../routes/access-management/useAccessManagementPermissions'
import { useSettingsPermissions } from '../routes/configuration/settings/useSettingsPermissions'

import { AppRoute } from './AppRoute'
import type { TNavigationItem } from './navigationItems'
import { NAV_ITEMS } from './navigationItems'

function filterItems(items: TNavigationItem[], hiddenPaths: Set<string>): TNavigationItem[] {
  return items.reduce<TNavigationItem[]>((acc, item) => {
    if (hiddenPaths.has(item.path)) return acc

    if (!item.children) {
      acc.push(item)
      return acc
    }

    const filteredChildren = filterItems(item.children, hiddenPaths)
    const changed =
      filteredChildren.length !== item.children.length || filteredChildren.some((c, i) => c !== item.children![i])
    acc.push(changed ? { ...item, children: filteredChildren } : item)
    return acc
  }, [])
}

export function useFilteredNavigationItems(): TNavigationItem[] {
  const { canRead: canReadSettings } = useSettingsPermissions()
  const { canReadUsers, canReadGroups, isLoading } = useAccessManagementPermissions()

  return useMemo(() => {
    const hiddenPaths = new Set<string>()

    if (!canReadSettings) hiddenPaths.add(AppRoute.SystemAdministration.Settings)
    if (!isLoading) {
      if (!canReadUsers) hiddenPaths.add(AppRoute.AccessManagement.Users)
      if (!canReadGroups) hiddenPaths.add(AppRoute.AccessManagement.Groups)
    }

    if (hiddenPaths.size === 0) return NAV_ITEMS

    return filterItems(NAV_ITEMS, hiddenPaths)
  }, [canReadSettings, canReadUsers, canReadGroups, isLoading])
}
