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
  RhUiInfrastructureIcon,
  RhUiLikeIcon,
  RhUiLightModeIcon,
  RhUiListIcon,
  RhUiMenuBarsIcon,
  RhUiPlayCircleIcon,
  RhUiProfileFillIcon,
  RhUiQuestionMarkCircleIcon,
  RhUiSettingsIcon,
  RhUiUsersIcon,
} from '@patternfly/react-icons'
import { useMemo, useRef, useState } from 'react'
import { useLocation } from 'wouter'

import { useAlerts } from '../components/alerts'
import { useAuthStore } from '../stores/useAuthStore'
import { useColorScheme } from '../theme/useColorScheme'
import { getErrorMessage } from '../utils/apiErrors'

import { AppRoute } from './AppRoute'
import type { INavigationItem } from './navigationItems'
import { navigationItems } from './navigationItems'
import { useUnsavedChanges } from './useUnsavedChanges'

const navIconMap: Record<string, React.ComponentType> = {
  '/workflow-builder': RhUiInfrastructureIcon,
  '/workflows': RhUiListIcon,
  '/executions': RhUiPlayCircleIcon,
  '/approvals': RhUiLikeIcon,
  '/access-management': RhUiUsersIcon,
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

/** Items with children that should show a dropdown instead of navigating directly. */
function hasDropdownChildren(item: INavigationItem): boolean {
  const enabledChildren = item.children?.filter((child) => !!child.element) ?? []
  return enabledChildren.length > 1
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

function NavDropdownItem({
  item,
  isActive,
  requestNavigation,
}: Readonly<{
  item: INavigationItem
  isActive: boolean
  requestNavigation: (path: string) => void
}>) {
  const enabledChildren = item.children?.filter((child) => !!child.element) ?? []
  const Icon = useMemo(() => getNavIcon(item.path), [item.path])
  const iconElement = useMemo(() => {
    if (!Icon) return undefined
    // eslint-disable-next-line react-hooks/static-components -- Icon is from navIconMap lookup, not created during render
    return <Icon />
  }, [Icon])

  const onMenuSelect = (_event: React.MouseEvent | undefined, itemId: string | number | undefined) => {
    const child = enabledChildren.find((c) => c.path === itemId)
    if (child) {
      requestNavigation(child.element ? child.path : findFirstEnabledPath(child))
    }
  }

  return (
    <NavItem
      preventDefault
      isActive={isActive}
      icon={iconElement}
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
  const [, setLocation] = useLocation()
  const logout = useAuthStore((s) => s.logout)
  const { showAlert } = useAlerts()

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
    <Tooltip aria="none" aria-live="off" content="User menu" position="right">
      <Dropdown
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        toggle={toggle}
        popperProps={{ position: 'right', preventOverflow: true }}
      >
        <DropdownList>
          <DropdownItem
            key="profile"
            onClick={() => {
              setLocation(AppRoute.Profile)
              setIsOpen(false)
            }}
          >
            My Profile
          </DropdownItem>
          <DropdownItem
            key="logout"
            onClick={async () => {
              setIsOpen(false)
              try {
                await logout()
              } catch (error: unknown) {
                showAlert({
                  title: 'Sign out failed',
                  description: getErrorMessage(error),
                  variant: 'danger',
                  autoDismiss: false,
                })
              }
            }}
          >
            Logout
          </DropdownItem>
        </DropdownList>
      </Dropdown>
    </Tooltip>
  )
}

export function AppDockedNav() {
  const [location] = useLocation()
  const { requestNavigation } = useUnsavedChanges()
  const { colorScheme, toggleColorScheme } = useColorScheme()

  const visibleItems = useMemo(
    () => navigationItems.filter((item) => !item.hidden && !item.path.startsWith('/support')),
    []
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
          <MastheadLogo component="a" className="pf-m-compact">
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
                    const Icon = getNavIcon(item.path)
                    return [
                      separator,
                      <NavItem
                        key={item.path}
                        preventDefault
                        id={`nav-${item.path.replaceAll('/', '-')}`}
                        itemId={item.path}
                        href={findFirstEnabledPath(item)}
                        isActive={isActive}
                        icon={Icon ? <Icon /> : undefined}
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
