import { useMemo } from 'react'

import { useSettingsPermissions } from '../routes/configuration/settings/useSettingsPermissions'

import { AppRoute } from './AppRoute'
import type { TNavigationItem } from './navigationItems'
import { NAV_ITEMS } from './navigationItems'

export function useFilteredNavigationItems(): TNavigationItem[] {
  const { canRead: canReadSettings } = useSettingsPermissions()

  return useMemo(() => {
    if (canReadSettings) return NAV_ITEMS

    return NAV_ITEMS.map((item) => {
      if (!item.children) return item

      const filteredChildren = item.children.filter((child) => child.path !== AppRoute.Configuration.Settings)

      if (filteredChildren.length === item.children.length) return item

      return { ...item, children: filteredChildren }
    })
  }, [canReadSettings])
}
