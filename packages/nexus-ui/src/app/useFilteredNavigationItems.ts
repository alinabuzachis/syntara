import { useMemo } from 'react'

import type { PermissionRequirement } from '../hooks/permissionUtils'
import { permissionKey } from '../hooks/permissionUtils'
import { usePermissionChecks } from '../hooks/usePermissionChecks'

import type { TNavigationItem } from './navigationItems'
import { NAV_ITEMS } from './navigationItems'

/**
 * Walks the nav tree and collects every unique permission requirement.
 * Computed once at module init since NAV_ITEMS is a static constant.
 */
function collectRequiredPermissions(items: readonly TNavigationItem[]): PermissionRequirement[] {
  const seen = new Map<string, PermissionRequirement>()

  function walk(navItems: readonly TNavigationItem[]) {
    for (const item of navItems) {
      if (item.requiredPermissions) {
        for (const perm of item.requiredPermissions) {
          const key = permissionKey(perm)
          if (!seen.has(key)) seen.set(key, perm)
        }
      }
      if (item.children) walk(item.children)
    }
  }

  walk(items)
  return [...seen.values()]
}

const ALL_NAV_PERMISSIONS = collectRequiredPermissions(NAV_ITEMS)

function isNavItemVisible(item: TNavigationItem, permissions: Record<string, boolean>): boolean {
  if (!item.requiredPermissions?.length) return true
  return item.requiredPermissions.some((p) => permissions[permissionKey(p)] === true)
}

function filterNavItems(items: readonly TNavigationItem[], permissions: Record<string, boolean>): TNavigationItem[] {
  return items
    .filter((item) => isNavItemVisible(item, permissions))
    .map((item) => {
      if (!item.children) return item

      const filteredChildren = filterNavItems(item.children, permissions)

      const unchanged =
        filteredChildren.length === item.children.length && filteredChildren.every((c, i) => c === item.children![i])
      if (unchanged) return item

      return { ...item, children: filteredChildren }
    })
}

/**
 * Returns the nav tree with permission-gated items removed.
 *
 * Automatically collects all `requiredPermissions` from NAV_ITEMS,
 * checks them via `usePermissionChecks`, and filters the tree.
 * Items are visible when at least one of their required permissions is granted.
 */
export function useFilteredNavigationItems(): TNavigationItem[] {
  const { permissions } = usePermissionChecks(ALL_NAV_PERMISSIONS)

  return useMemo(() => filterNavItems(NAV_ITEMS, permissions), [permissions])
}
