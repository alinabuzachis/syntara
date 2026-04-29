import { useMemo } from 'react'

import { useSettingsPermissions } from '../routes/configuration/settings/useSettingsPermissions'

import { AppRoute } from './AppRoute'
import type { INavigationItem } from './navigationItems'
import { navigationItems } from './navigationItems'

export function useFilteredNavigationItems(): INavigationItem[] {
  const { canRead: canReadSettings } = useSettingsPermissions()

  return useMemo(() => {
    if (canReadSettings) return navigationItems

    return navigationItems.map((item) => {
      if (!item.children) return item

      const filteredChildren = item.children.filter((child) => child.path !== AppRoute.Configuration.Settings)

      if (filteredChildren.length === item.children.length) return item

      return { ...item, children: filteredChildren }
    })
  }, [canReadSettings])
}
