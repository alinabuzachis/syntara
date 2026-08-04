import { Breadcrumb, BreadcrumbItem } from '@patternfly/react-core'
import type { BreadcrumbItemRenderArgs } from '@patternfly/react-core'
import { useNavigate } from '@tanstack/react-router'
import type { MouseEvent } from 'react'
import { useCallback, useSyncExternalStore } from 'react'

import type { AppBreadcrumbItem } from '../../app/breadcrumbs/appBreadcrumbItem'
import { detachPromise } from '../../utils/detachPromise'
import { isModifiedClick } from '../../utils/isModifiedClick'

import { NxPageBreadcrumbsCollapsedMiddle } from './NxPageBreadcrumbsCollapsedMiddle'

export type { AppBreadcrumbItem }

type BreadcrumbLinkProps = Readonly<{
  href: string
  label: string
  className: string
  ariaCurrent: 'page' | undefined
  onNavigate: (href: string) => void
}>

function BreadcrumbLink(props: BreadcrumbLinkProps) {
  const { href, label, className, ariaCurrent, onNavigate } = props
  return (
    <a
      href={href}
      className={className}
      aria-current={ariaCurrent}
      onClick={(e: MouseEvent) => {
        if (isModifiedClick(e)) return
        e.preventDefault()
        onNavigate(href)
      }}
    >
      {label}
    </a>
  )
}

function renderBreadcrumbLink(href: string, label: string, onNavigate: (href: string) => void) {
  return ({ className, ariaCurrent }: BreadcrumbItemRenderArgs) => (
    <BreadcrumbLink href={href} label={label} className={className} ariaCurrent={ariaCurrent} onNavigate={onNavigate} />
  )
}

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

type NxPageBreadcrumbsProps = Readonly<{
  /** Ordered breadcrumb segments. Requires at least two items to render. */
  items: readonly AppBreadcrumbItem[]
}>

/** Breadcrumb trail where parent items are links and the last item is the current page. On narrow viewports, two or more middle segments collapse into a dropdown. */
export function NxPageBreadcrumbs(props: NxPageBreadcrumbsProps) {
  const { items } = props
  const isNarrow = useNarrowViewportForBreadcrumb()
  const navigate = useNavigate()

  const handleNavigate = useCallback(
    (href: string) => {
      detachPromise(navigate({ to: href }))
    },
    [navigate]
  )

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
            <BreadcrumbItem render={renderBreadcrumbLink(first.href, first.label, handleNavigate)} />
          ) : (
            <BreadcrumbItem isActive>{first.label}</BreadcrumbItem>
          )}
          <NxPageBreadcrumbsCollapsedMiddle middleItems={middle} />
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
              <BreadcrumbItem key={item.href} render={renderBreadcrumbLink(item.href, item.label, handleNavigate)} />
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
