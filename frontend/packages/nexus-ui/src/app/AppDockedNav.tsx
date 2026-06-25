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
  Menu,
  MenuItem,
  MenuList,
  MenuToggle,
  Nav,
  NavContext,
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
  RhUiDarkModeIcon,
  RhUiLightModeIcon,
  RhUiMenuBarsIcon,
  RhUiProfileFillIcon,
  RhUiQuestionMarkCircleIcon,
} from '@patternfly/react-icons'
import { useContext, useMemo, useRef, useState } from 'react'

import { authClient } from '../client'
import { useLocation } from '../hooks/routing/useLocation'
import { useNavigate } from '../hooks/routing/useNavigate'
import { useAlerts } from '../providers/alerts'
import { useColorScheme } from '../providers/theme/useColorScheme'
import { useAuthStore } from '../stores/useAuthStore'
import { getErrorMessage } from '../utils/apiErrors'
import { detachPromise } from '../utils/detachPromise'
import { useDocLink } from '../utils/docs/useDocLink'

import { AppRoute } from './AppRoute'
import type { TNavigationItem } from './navigationItems'
import { useFilteredNavigationItems } from './useFilteredNavigationItems'
import { useUnsavedChanges } from './useUnsavedChanges'

function findFirstEnabledPath(item: TNavigationItem): string {
  if (item.children?.length) {
    const firstEnabled = item.children.find((child) => !!child.element)
    return firstEnabled?.path ?? item.path
  }
  return item.path
}

/** Items with children that should show a dropdown instead of navigating directly. */
function hasDropdownChildren(item: TNavigationItem): boolean {
  const enabledChildren = item.children?.filter((child) => !!child.element) ?? []
  return enabledChildren.length > 1
}

function createNavItemRefs(items: TNavigationItem[]) {
  const refs: Record<string, React.RefObject<HTMLAnchorElement | null>> = {}
  items.forEach((item) => {
    refs[item.path] = { current: null }
  })
  return refs
}

function navigateToNavItem(
  itemId: string | number,
  visibleItems: TNavigationItem[],
  requestNavigation: (path: string) => void
) {
  const item = visibleItems.find((navItem) => navItem.path === itemId)
  if (item) requestNavigation(findFirstEnabledPath(item))
}

function openExternalDoc(url: string) {
  globalThis.open(url, '_blank', 'noopener,noreferrer')
}

function NavDropdownItem({
  item,
  isActive,
  requestNavigation,
}: Readonly<{
  item: TNavigationItem
  isActive: boolean
  requestNavigation: (path: string) => void
}>) {
  const enabledChildren = item.children?.filter((child) => !!child.element) ?? []
  const { setFlyoutRef } = useContext(NavContext)

  const onMenuSelect = (_event: React.MouseEvent | undefined, itemId: string | number | undefined) => {
    const child = enabledChildren.find((c) => c.path === itemId)
    if (child) {
      // dismiss the flyout panel before navigating
      setFlyoutRef?.(null)
      requestNavigation(child.element ? child.path : findFirstEnabledPath(child))
    }
  }

  return (
    <NavItem
      preventDefault
      isActive={isActive}
      icon={item.icon}
      aria-label={item.label}
      itemId={item.path}
      id={`nav-${item.path.replaceAll('/', '-')}`}
      flyout={
        <Menu containsFlyout isNavFlyout onSelect={onMenuSelect}>
          <MenuList>
            {enabledChildren.map((child) => (
              <MenuItem
                key={child.path}
                icon={child.icon}
                itemId={child.path}
                onClick={(e: React.MouseEvent) => e.preventDefault()}
              >
                {child.label}
              </MenuItem>
            ))}
          </MenuList>
        </Menu>
      }
    />
  )
}

function UserMenuDropdown() {
  const [isOpen, setIsOpen] = useState(false)
  const setLocation = useNavigate()
  const logout = useAuthStore((s) => s.logout)
  const { showAlert } = useAlerts()
  const { data: currentUser } = authClient.useQuery('get', '/auth/me')

  const handleLogoutClick = () => {
    setIsOpen(false)
    detachPromise(logout(), {
      onReject: (error: unknown) => {
        showAlert({
          title: 'Sign out failed',
          description: getErrorMessage(error),
          variant: 'danger',
          autoDismiss: false,
        })
      },
    })
  }

  const toggle = (dropdownRef: React.Ref<MenuToggleElement>) => (
    <MenuToggle
      ref={dropdownRef}
      isExpanded={isOpen}
      variant="plain"
      aria-label="User menu"
      style={{ padding: 0 }}
      onClick={() => setIsOpen(!isOpen)}
      onMouseEnter={() => setIsOpen(true)}
    >
      <RhUiProfileFillIcon />
    </MenuToggle>
  )

  return (
    <Dropdown
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      toggle={toggle}
      popperProps={{ position: 'right', preventOverflow: true }}
    >
      <DropdownList>
        <DropdownItem
          key="profile"
          isDisabled={!currentUser?.id}
          onClick={() => {
            if (currentUser?.id) {
              setLocation(AppRoute.AccessManagement.UserDetail.replace(':userId', currentUser.id))
              setIsOpen(false)
            }
          }}
        >
          My Profile
        </DropdownItem>
        <DropdownItem key="logout" onClick={handleLogoutClick}>
          Logout
        </DropdownItem>
      </DropdownList>
    </Dropdown>
  )
}

export function AppDockedNav() {
  const location = useLocation()
  const { requestNavigation } = useUnsavedChanges()
  const { colorScheme, toggleColorScheme } = useColorScheme()
  const docsHomeUrl = useDocLink('home')

  const filteredItems = useFilteredNavigationItems()
  const visibleItems = useMemo(
    () => filteredItems.filter((item) => !item.hidden && !item.path.startsWith('/support')),
    [filteredItems]
  )
  const activeTopLevel = '/' + location.split('/')[1]

  const menuToggleRef = useRef<HTMLButtonElement>(null)
  const colorSchemeRef = useRef<HTMLButtonElement>(null)
  const helpRef = useRef<HTMLButtonElement>(null)
  const navItemRefs = useMemo(() => createNavItemRefs(visibleItems), [visibleItems])

  const colorSchemeToggleLabel = colorScheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <Masthead id="docked-masthead" variant="docked">
      <MastheadMain>
        <MastheadBrand>
          <MastheadLogo component="a" href="/" aria-label="Home" className="pf-m-compact">
            <RedhatIcon
              style={{
                height: 'var(--pf-t--global--icon--size--md)',
                width: 'var(--pf-t--global--icon--size--md)',
                color: 'var(--pf-t--custom--color--redhat-logo)',
              }}
            />
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
                  {visibleItems.flatMap((item) => {
                    const itemTopLevel = '/' + item.path.split('/')[1]
                    const isActive = itemTopLevel === activeTopLevel
                    const separator = item.separatorBefore ? (
                      <Divider key={`divider-${item.path}`} component="li" />
                    ) : null
                    if (hasDropdownChildren(item)) {
                      return [
                        separator,
                        <NavDropdownItem
                          key={item.path}
                          item={item}
                          isActive={isActive}
                          requestNavigation={requestNavigation}
                        />,
                      ]
                    }
                    return [
                      separator,
                      <NavItem
                        key={item.path}
                        preventDefault
                        id={`nav-${item.path.replaceAll('/', '-')}`}
                        itemId={item.path}
                        href={findFirstEnabledPath(item)}
                        isActive={isActive}
                        icon={item.icon}
                        aria-label={item.label}
                        anchorRef={navItemRefs[item.path]}
                      />,
                    ]
                  })}
                </NavList>
              </Nav>
            </ToolbarItem>
            <ToolbarGroup variant="action-group-plain" align={{ default: 'alignEnd' }}>
              <ToolbarGroup variant="action-group-plain">
                <ToolbarItem>
                  <Button
                    variant="plain"
                    aria-label={colorSchemeToggleLabel}
                    ref={colorSchemeRef}
                    onClick={toggleColorScheme}
                  >
                    {colorScheme === 'dark' ? <RhUiDarkModeIcon /> : <RhUiLightModeIcon />}
                  </Button>
                </ToolbarItem>
                <ToolbarItem>
                  <Button
                    variant="plain"
                    aria-label="Documentation (opens in a new tab)"
                    ref={helpRef}
                    onClick={() => openExternalDoc(docsHomeUrl)}
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
      {visibleItems
        .filter((item) => !hasDropdownChildren(item))
        .map((item) => (
          <Tooltip
            key={`tooltip-${item.path}`}
            aria="none"
            aria-live="off"
            triggerRef={navItemRefs[item.path]}
            content={item.label}
            position="right"
          />
        ))}
      <Tooltip
        aria="none"
        aria-live="off"
        triggerRef={colorSchemeRef}
        content={colorSchemeToggleLabel}
        position="right"
      />
      <Tooltip aria="none" aria-live="off" triggerRef={helpRef} content="Documentation" position="right" />
    </Masthead>
  )
}
