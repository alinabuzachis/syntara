import { Badge, BreadcrumbItem, Dropdown, DropdownItem, DropdownList, MenuToggle } from '@patternfly/react-core'
import type { MenuToggleElement } from '@patternfly/react-core'
import type { MouseEvent, Ref } from 'react'
import { useCallback, useMemo, useState } from 'react'

import type { AppBreadcrumbItem } from '../../app/breadcrumbs/appBreadcrumbItem'

type BreadcrumbDropdownToggleProps = Readonly<{
  toggleRef: Ref<MenuToggleElement | null>
  /** Whether the dropdown is currently open. */
  isOpen: boolean
  /** Number of collapsed middle segments, shown in the badge and announced to screen readers. */
  middleCount: number
  /** PF6 Dropdown injects its open/close handler here via cloneElement — must be forwarded to the underlying MenuToggle. */
  onClick?: (e: MouseEvent<HTMLElement>) => void
}>

/** Plain-text menu toggle displaying a badge with the count of hidden breadcrumb segments. */
function BreadcrumbDropdownToggle(props: BreadcrumbDropdownToggleProps) {
  const { toggleRef, isOpen, middleCount, onClick } = props
  return (
    <MenuToggle
      ref={toggleRef}
      variant="plainText"
      isExpanded={isOpen}
      aria-label={`Earlier pages, ${middleCount} levels`}
      onClick={onClick}
    >
      <Badge>{middleCount}</Badge>
    </MenuToggle>
  )
}

/** Render function for the PF Dropdown `toggle` prop. Kept at module scope to satisfy Sonar S6478 (no nested components). */
function renderBreadcrumbDropdownToggle(
  toggleRef: Ref<MenuToggleElement | null>,
  isOpen: boolean,
  middleCount: number
) {
  return <BreadcrumbDropdownToggle toggleRef={toggleRef} isOpen={isOpen} middleCount={middleCount} />
}

export type NxPageBreadcrumbsCollapsedMiddleProps = Readonly<{
  /** The middle breadcrumb segments to collapse behind the dropdown toggle. */
  middleItems: readonly AppBreadcrumbItem[]
}>

/** Narrow-layout breadcrumb: collapses two or more middle segments behind a dropdown toggle. */
export function NxPageBreadcrumbsCollapsedMiddle(props: NxPageBreadcrumbsCollapsedMiddleProps) {
  const { middleItems } = props
  const [isOpen, setIsOpen] = useState(false)

  const onSelect = useCallback(() => {
    setIsOpen(false)
  }, [])

  const middleCount = middleItems.length

  const renderToggle = useMemo(
    () => (toggleRef: Ref<MenuToggleElement | null>) => renderBreadcrumbDropdownToggle(toggleRef, isOpen, middleCount),
    [isOpen, middleCount]
  )

  return (
    <BreadcrumbItem isDropdown>
      <Dropdown isOpen={isOpen} onOpenChange={setIsOpen} toggle={renderToggle}>
        <DropdownList>
          {middleItems.map((item) => (
            <DropdownItem key={item.href ?? item.label} to={item.href} onClick={onSelect}>
              {item.label}
            </DropdownItem>
          ))}
        </DropdownList>
      </Dropdown>
    </BreadcrumbItem>
  )
}
