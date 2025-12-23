import {
  Avatar,
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
  RhUiDarkModeIcon,
  RhUiIncreasingIcon,
  RhUiInfrastructureIcon,
  RhUiLikeIcon,
  RhUiListIcon,
  RhUiMenuBarsIcon,
  RhUiNotificationIcon,
  RhUiQuestionMarkCircleIcon,
  RhUiSettingsIcon,
} from '@patternfly/react-icons'
import { useMemo, useRef, useState } from 'react'
import { useLocation } from 'wouter'

import avatarImg from '../assets/avatar.svg'
import { RedHatIcon } from '../components/icons/RedHatIcon'

import { navigationItems } from './navigationItems'
import { useUnsavedChanges } from './useUnsavedChanges'

// Map navigation paths to their icons
const navIconMap: Record<string, React.ComponentType> = {
  '/dashboard': RhUiIncreasingIcon,
  '/automation-builder': RhUiInfrastructureIcon,
  '/automations': RhUiListIcon,
  '/approvals': RhUiLikeIcon,
  '/configuration': RhUiSettingsIcon,
}

export function AppDockedNav() {
  const [location] = useLocation()
  const { requestNavigation } = useUnsavedChanges()
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)

  // Filter out hidden navigation items and Support (accessed via Help button)
  const visibleItems = navigationItems.filter((item) => !item.hidden && !item.path.startsWith('/support'))

  // Determine active nav item based on current location
  const activeTopLevel = '/' + location.split('/')[1]

  // Refs for tooltips
  const menuToggleRef = useRef<HTMLButtonElement>(null)
  const darkModeRef = useRef<HTMLButtonElement>(null)
  const helpRef = useRef<HTMLButtonElement>(null)
  const notificationsRef = useRef<HTMLAnchorElement>(null)

  // Create stable refs for each nav item
  const navItemRefs = useMemo(() => {
    const refs: Record<string, React.RefObject<HTMLAnchorElement | null>> = {}
    visibleItems.forEach((item) => {
      refs[item.path] = { current: null }
    })
    return refs
  }, [visibleItems])

  const handleNavSelect = (
    _event: React.FormEvent<HTMLInputElement>,
    selectedItem: { groupId: string | number; itemId: string | number; to: string }
  ) => {
    const item = visibleItems.find((navItem) => navItem.path === selectedItem.itemId)
    if (item) {
      // If item has children, navigate to first enabled child
      if (item.children?.length) {
        const firstEnabledChild = item.children.find((child) => !!child.element)
        if (firstEnabledChild) {
          requestNavigation(firstEnabledChild.path)
        } else if (item.path) {
          requestNavigation(item.path)
        }
      } else if (item.path) {
        requestNavigation(item.path)
      }
    }
  }

  const handleHelpClick = () => {
    const supportItem = navigationItems.find((item) => item.path.startsWith('/support'))
    if (supportItem) {
      if (supportItem.children?.length) {
        const firstEnabledChild = supportItem.children.find((child) => !!child.element)
        if (firstEnabledChild) {
          requestNavigation(firstEnabledChild.path)
        } else {
          requestNavigation(supportItem.path)
        }
      } else {
        requestNavigation(supportItem.path)
      }
    }
  }

  // Get icon for a navigation path
  const getNavIcon = (path: string) => {
    const topLevelPath = '/' + path.split('/')[1]
    return navIconMap[topLevelPath]
  }

  const userMenuToggle = (toggleRef: React.Ref<MenuToggleElement>) => (
    <MenuToggle
      ref={toggleRef}
      onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
      isExpanded={isUserMenuOpen}
      variant="plain"
      aria-label="User menu"
      style={{ padding: 0 }}
    >
      <Avatar src={avatarImg} alt="User avatar" size="sm" />
    </MenuToggle>
  )

  return (
    <Masthead id="docked-masthead" variant="docked">
      <MastheadMain>
        <MastheadBrand>
          <MastheadLogo component="a">
            <RedHatIcon className="!h-[24px] !w-[24px]" />
          </MastheadLogo>
        </MastheadBrand>
      </MastheadMain>
      <MastheadContent>
        <Toolbar id="docked-toolbar" isVertical>
          <ToolbarContent>
            {/* Menu Toggle */}
            <ToolbarItem>
              <Button variant="plain" aria-label="Toggle menu" ref={menuToggleRef}>
                <RhUiMenuBarsIcon />
              </Button>
            </ToolbarItem>
            <Divider />
            {/* Main Navigation */}
            <ToolbarItem>
              <Nav onSelect={handleNavSelect} variant="docked" aria-label="Main navigation">
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
                        isActive={isActive}
                        icon={Icon ? <Icon /> : undefined}
                        aria-label={item.label}
                        anchorRef={navItemRefs[item.path]}
                      />
                    )
                  })}
                  {/* Notifications */}
                  <NavItem
                    key="notifications"
                    preventDefault
                    id="nav-notifications"
                    itemId="notifications"
                    isActive={false}
                    icon={<RhUiNotificationIcon />}
                    aria-label="Notifications"
                    anchorRef={notificationsRef}
                  />
                </NavList>
              </Nav>
            </ToolbarItem>
            {/* Bottom Section - pushed to end */}
            <ToolbarGroup variant="action-group-plain" align={{ default: 'alignEnd' }}>
              <ToolbarGroup variant="action-group-plain">
                {/* Dark Mode Toggle */}
                <ToolbarItem>
                  <Button variant="plain" aria-label="Toggle dark mode" ref={darkModeRef}>
                    <RhUiDarkModeIcon />
                  </Button>
                </ToolbarItem>
                {/* Help */}
                <ToolbarItem>
                  <Button variant="plain" aria-label="Help" ref={helpRef} onClick={handleHelpClick}>
                    <RhUiQuestionMarkCircleIcon />
                  </Button>
                </ToolbarItem>
                {/* User Menu */}
                <ToolbarItem>
                  <Dropdown
                    isOpen={isUserMenuOpen}
                    onOpenChange={(isOpen) => setIsUserMenuOpen(isOpen)}
                    toggle={userMenuToggle}
                    popperProps={{ position: 'right', preventOverflow: true }}
                  >
                    <DropdownList>
                      <DropdownItem key="profile">My Profile</DropdownItem>
                      <DropdownItem key="settings">Settings</DropdownItem>
                      <DropdownItem key="logout">Logout</DropdownItem>
                    </DropdownList>
                  </Dropdown>
                </ToolbarItem>
              </ToolbarGroup>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      </MastheadContent>
      {/* Tooltips using refs */}
      <Tooltip aria="none" aria-live="off" triggerRef={menuToggleRef} content="Menu" position="right" />
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
      <Tooltip aria="none" aria-live="off" triggerRef={notificationsRef} content="Notifications" position="right" />
      <Tooltip aria="none" aria-live="off" triggerRef={darkModeRef} content="Dark mode" position="right" />
      <Tooltip aria="none" aria-live="off" triggerRef={helpRef} content="Help" position="right" />
    </Masthead>
  )
}
