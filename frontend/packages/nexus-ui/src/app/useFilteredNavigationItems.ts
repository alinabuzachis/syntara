import { useMemo } from 'react'

import type { PermissionRequirement } from '../hooks/permissionUtils'
import { hasPermissionGrant, permissionKey } from '../hooks/permissionUtils'
import { usePermissionChecks } from '../hooks/usePermissionChecks'
import { useAllPermissions } from '../routes/access/useAllPermissions'

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
  const filtered: TNavigationItem[] = []

  for (const item of items) {
    if (!isNavItemVisible(item, permissions)) continue

    if (!item.children) {
      filtered.push(item)
      continue
    }

    const filteredChildren = filterNavItems(item.children, permissions)

    // Hide section when it originally had visible children but all were filtered out
    const hadVisibleChildren = item.children.some((c) => !c.hidden)
    if (hadVisibleChildren && !filteredChildren.some((c) => !c.hidden)) continue

    const unchanged =
      filteredChildren.length === item.children.length && filteredChildren.every((c, i) => c === item.children![i])

    filtered.push(unchanged ? item : { ...item, children: filteredChildren })
  }

  return filtered
}

function deriveProjectScopedPermissions(
  allPerms: { effect?: string; actions: string[]; scope?: string }[],
  requirements: readonly PermissionRequirement[]
): Record<string, boolean> {
  const result: Record<string, boolean> = {}
  for (const req of requirements) {
    if (hasPermissionGrant(allPerms, `${req.resourceType}:${req.action}`)) {
      result[permissionKey(req)] = true
    }
  }
  return result
}

/**
 * Returns the nav tree with permission-gated items removed.
 *
 * Uses global can_i checks (which also pre-warm the cache for downstream
 * useCanI consumers) supplemented by what_can_i for project-scoped grants.
 */
export function useFilteredNavigationItems(): TNavigationItem[] {
  const { permissions: globalPermissions } = usePermissionChecks(ALL_NAV_PERMISSIONS)
  const { permissions: allPerms } = useAllPermissions()

  const permissions = useMemo(() => {
    const projectScoped = deriveProjectScopedPermissions(allPerms, ALL_NAV_PERMISSIONS)
    return { ...globalPermissions, ...projectScoped }
  }, [globalPermissions, allPerms])

  return useMemo(() => filterNavItems(NAV_ITEMS, permissions), [permissions])
}
