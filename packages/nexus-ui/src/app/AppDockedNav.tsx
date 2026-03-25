import {
  Button,
  Divider,
  Dropdown,
  DropdownItem,
  DropdownList,
  Masthead,
  MastheadBrand,
  MastheadContent,
  MastheadLogo,
  MastheadMain,
  MenuToggle,
  Nav,
  NavItem,
  NavList,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
  Tooltip,
} from '@patternfly/react-core'
import type { MenuToggleElement } from '@patternfly/react-core'
import {
  RedhatIcon,
  RhUiInfrastructureIcon,
  RhUiLikeIcon,
  RhUiListIcon,
  RhUiMenuBarsIcon,
  RhUiPlayCircleIcon,
  RhUiProfileFillIcon,
  RhUiQuestionMarkCircleIcon,
  RhUiSettingsIcon,
} from '@patternfly/react-icons'
import { useMemo, useRef, useState } from 'react'
import { useLocation } from 'wouter'

import type { INavigationItem } from './navigationItems'
import { navigationItems } from './navigationItems'
import { useUnsavedChanges } from './useUnsavedChanges'

const navIconMap: Record<string, React.ComponentType> = {
  '/automation-builder': RhUiInfrastructureIcon,
  '/automations': RhUiListIcon,
  '/executions': RhUiPlayCircleIcon,
  '/approvals': RhUiLikeIcon,
  '/configuration': RhUiSettingsIcon,
}

function getNavIcon(path: string) {
  return navIconMap['/' + path.split('/')[1]]
}

function findFirstEnabledPath(item: INavigationItem): string {
  if (item.children?.length) {
    const firstEnabled = item.children.find((child) => !!child.element)
    return firstEnabled?.path ?? item.path
  }
  return item.path
}

function createNavItemRefs(items: INavigationItem[]) {
  const refs: Record<string, React.RefObject<HTMLAnchorElement | null>> = {}
  items.forEach((item) => {
    refs[item.path] = { current: null }
  })
  return refs
}

function navigateToNavItem(
  itemId: string | number,
  visibleItems: INavigationItem[],
  requestNavigation: (path: string) => void
) {
  const item = visibleItems.find((navItem) => navItem.path === itemId)
  if (item) requestNavigation(findFirstEnabledPath(item))
}

function navigateToHelp(requestNavigation: (path: string) => void) {
  const target = navigationItems.find((item) => item.path.startsWith('/support'))
  if (target) requestNavigation(findFirstEnabledPath(target))
}

function UserMenuDropdown() {
  const [isOpen, setIsOpen] = useState(false)

  const toggle = (toggleRef: React.Ref<MenuToggleElement>) => (
    <MenuToggle
      ref={toggleRef}
      onClick={() => setIsOpen(!isOpen)}
      isExpanded={isOpen}
      variant="plain"
      aria-label="User menu"
      style={{ padding: 0 }}
    >
      <RhUiProfileFillIcon />
    </MenuToggle>
  )

  return (
    <Tooltip aria="none" aria-live="off" content="User profile (coming soon)" position="right">
      <Dropdown
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        toggle={toggle}
        popperProps={{ position: 'right', preventOverflow: true }}
      >
        <DropdownList>
          <DropdownItem key="profile">My Profile</DropdownItem>
          <DropdownItem key="settings">Settings</DropdownItem>
          <DropdownItem key="logout">Logout</DropdownItem>
        </DropdownList>
      </Dropdown>
    </Tooltip>
  )
}

export function AppDockedNav() {
  const [location] = useLocation()
  const { requestNavigation } = useUnsavedChanges()

  const visibleItems = useMemo(
    () => navigationItems.filter((item) => !item.hidden && !item.path.startsWith('/support')),
    []
  )
  const activeTopLevel = '/' + location.split('/')[1]

  const menuToggleRef = useRef<HTMLButtonElement>(null)
  const darkModeRef = useRef<HTMLButtonElement>(null)
  const helpRef = useRef<HTMLButtonElement>(null)
  const navItemRefs = useMemo(() => createNavItemRefs(visibleItems), [visibleItems])

  return (
    <Masthead id="docked-masthead" variant="docked">
      <MastheadMain>
        <MastheadBrand>
          <MastheadLogo component="a">
            <RedhatIcon style={{ height: '24px', width: '24px', color: '#E00' }} />
          </MastheadLogo>
        </MastheadBrand>
      </MastheadMain>
      <MastheadContent>
        <Toolbar id="docked-toolbar" isVertical>
          <ToolbarContent>
            <ToolbarItem>
              <Button variant="plain" aria-label="Toggle menu" ref={menuToggleRef}>
                <RhUiMenuBarsIcon />
              </Button>
            </ToolbarItem>
            <Divider />
            <ToolbarItem>
              <Nav
                onSelect={(_event, selectedItem) =>
                  navigateToNavItem(selectedItem.itemId, visibleItems, requestNavigation)
                }
                variant="docked"
                aria-label="Main navigation"
              >
                <NavList>
                  {visibleItems.map((item) => {
                    const itemTopLevel = '/' + item.path.split('/')[1]
                    const isActive = itemTopLevel === activeTopLevel
                    const Icon = getNavIcon(item.path)
                    return (
                      <NavItem
                        key={item.path}
                        preventDefault
                        id={`nav-${item.path.replace(/\//g, '-')}`}
                        itemId={item.path}
                        href={findFirstEnabledPath(item)}
                        isActive={isActive}
                        icon={Icon ? <Icon /> : undefined}
                        aria-label={item.label}
                        anchorRef={navItemRefs[item.path]}
                      />
                    )
                  })}
                </NavList>
              </Nav>
            </ToolbarItem>
            <ToolbarGroup variant="action-group-plain" align={{ default: 'alignEnd' }}>
              <ToolbarGroup variant="action-group-plain">
                {/* TODO: Uncomment this when mode switcher is implemented */}
                {/* <ToolbarItem>
                  <Button variant="plain" aria-label="Toggle dark mode" ref={darkModeRef}>
                    <RhUiDarkModeIcon />
                  </Button>
                </ToolbarItem> */}
                <ToolbarItem>
                  <Button
                    variant="plain"
                    aria-label="Help"
                    ref={helpRef}
                    onClick={() => navigateToHelp(requestNavigation)}
                  >
                    <RhUiQuestionMarkCircleIcon />
                  </Button>
                </ToolbarItem>
                <ToolbarItem>
                  <UserMenuDropdown />
                </ToolbarItem>
              </ToolbarGroup>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      </MastheadContent>
      <Tooltip aria="none" aria-live="off" triggerRef={menuToggleRef} content="Menu (coming soon)" position="right" />
      {visibleItems.map((item) => (
        <Tooltip
          key={`tooltip-${item.path}`}
          aria="none"
          aria-live="off"
          triggerRef={navItemRefs[item.path]}
          content={item.label}
          position="right"
        />
      ))}
      <Tooltip aria="none" aria-live="off" triggerRef={darkModeRef} content="Dark mode" position="right" />
      <Tooltip aria="none" aria-live="off" triggerRef={helpRef} content="Documentation" position="right" />
    </Masthead>
  )
}
