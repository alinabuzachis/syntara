import { Breadcrumb, BreadcrumbItem } from '@patternfly/react-core'
import { useSyncExternalStore } from 'react'

import { BreadcrumbCollapsedMiddle } from './AppPageBreadcrumbsCollapsedMiddle'
import type { AppBreadcrumbItem } from './breadcrumbs/appBreadcrumbItem'

export type { AppBreadcrumbItem }

const NARROW_MEDIA_QUERY = '(max-width: 768px)'

function subscribeNarrowMedia(callback: () => void) {
  const mq = globalThis.window?.matchMedia?.(NARROW_MEDIA_QUERY)
  if (!mq) {
    return () => {}
  }
  mq.addEventListener('change', callback)
  return () => mq.removeEventListener('change', callback)
}

function getNarrowMediaSnapshot() {
  return globalThis.window?.matchMedia?.(NARROW_MEDIA_QUERY).matches ?? false
}

function getNarrowMediaServerSnapshot() {
  return false
}

function useNarrowViewportForBreadcrumb() {
  return useSyncExternalStore(subscribeNarrowMedia, getNarrowMediaSnapshot, getNarrowMediaServerSnapshot)
}

type AppPageBreadcrumbsProps = Readonly<{
  items: readonly AppBreadcrumbItem[]
}>

/**
 * PatternFly breadcrumb trail. Parent items are links; the last item is the current page (no link).
 * On narrow viewports, when there are two or more middle segments, they collapse into a dropdown.
 */
export function AppPageBreadcrumbs(props: AppPageBreadcrumbsProps) {
  const { items } = props
  const isNarrow = useNarrowViewportForBreadcrumb()

  if (items.length < 2) {
    return null
  }

  const lastIndex = items.length - 1
  const first = items[0]
  const last = items[lastIndex]
  const middle = items.slice(1, lastIndex)
  const collapseMiddle = isNarrow && middle.length >= 2

  return (
    <Breadcrumb aria-label="Breadcrumb">
      {collapseMiddle ? (
        <>
          {first.href ? (
            <BreadcrumbItem to={first.href}>{first.label}</BreadcrumbItem>
          ) : (
            <BreadcrumbItem isActive>{first.label}</BreadcrumbItem>
          )}
          <BreadcrumbCollapsedMiddle middleItems={middle} />
          <BreadcrumbItem isActive>{last.label}</BreadcrumbItem>
        </>
      ) : (
        items.map((item, index) => {
          const isLast = index === lastIndex
          const itemKey = item.href ?? `current:${item.label}`
          if (isLast) {
            return (
              <BreadcrumbItem key={itemKey} isActive>
                {item.label}
              </BreadcrumbItem>
            )
          }
          if (item.href) {
            return (
              <BreadcrumbItem key={item.href} to={item.href}>
                {item.label}
              </BreadcrumbItem>
            )
          }
          return (
            <BreadcrumbItem key={itemKey} isActive>
              {item.label}
            </BreadcrumbItem>
          )
        })
      )}
    </Breadcrumb>
  )
}
