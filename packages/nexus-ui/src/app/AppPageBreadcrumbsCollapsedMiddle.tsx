import { Badge, BreadcrumbItem, Dropdown, DropdownItem, DropdownList, MenuToggle } from '@patternfly/react-core'
import type { MenuToggleElement } from '@patternfly/react-core'
import type { MouseEvent, Ref } from 'react'
import { useCallback, useMemo, useState } from 'react'

import type { AppBreadcrumbItem } from './breadcrumbs/appBreadcrumbItem'

type BreadcrumbDropdownToggleProps = Readonly<{
  toggleRef: Ref<MenuToggleElement | null>
  isOpen: boolean
  middleCount: number
  onClick?: (e: MouseEvent<HTMLElement>) => void
}>

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

function renderBreadcrumbDropdownToggle(
  toggleRef: Ref<MenuToggleElement | null>,
  isOpen: boolean,
  middleCount: number
) {
  return <BreadcrumbDropdownToggle toggleRef={toggleRef} isOpen={isOpen} middleCount={middleCount} />
}

export type BreadcrumbCollapsedMiddleProps = Readonly<{
  middleItems: readonly AppBreadcrumbItem[]
}>

/** Narrow-layout breadcrumb: collapses two or more middle segments behind a dropdown toggle. */
export function BreadcrumbCollapsedMiddle(props: BreadcrumbCollapsedMiddleProps) {
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
