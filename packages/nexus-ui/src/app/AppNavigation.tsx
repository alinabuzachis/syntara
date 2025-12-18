import { CompassPanel, Tab, TabContent, TabTitleText, Tabs, TabsComponent } from '@patternfly/react-core'
import { useRef } from 'react'
import { useLocation } from 'wouter'

import { navigationItems } from './navigationItems'

export function AppNavigation() {
  const [location, setLocation] = useLocation()
  const subTabsRef = useRef<HTMLDivElement>(null)
  const visibleItems = navigationItems.filter((item) => !item.hidden)

  // Find active top-level item
  // Only match items whose path starts with '/' + activeTopLevel + '/' (excludes exact matches)
  // This prevents Automations from showing subtabs even though it has children
  const activeTopLevel = '/' + location.split('/')[1]
  const activeTopNavItem = visibleItems.find((item) => item.path.startsWith(activeTopLevel + '/'))
  const activeTopIndex = visibleItems.findIndex(
    (item) => item.path.startsWith(activeTopLevel + '/') || item.path === activeTopLevel
  )

  // Get visible children for subtabs
  const visibleChildren = activeTopNavItem?.children?.filter((child) => !child.hidden) || []
  // Find active child - only consider enabled children (those with an element)
  // Sort enabled children by path length (longer paths first) to match more specific paths first
  const enabledChildren = visibleChildren.filter((child) => !!child.element)
  const sortedEnabledChildren = [...enabledChildren].sort((a, b) => b.path.length - a.path.length)
  const activeChildItem = sortedEnabledChildren.find(
    (child) => location === child.path || location.startsWith(child.path + '/')
  )
  const activeSubtabIndex = activeChildItem ? visibleChildren.findIndex((child) => child === activeChildItem) : -1

  // Handle tab selection for top-level nav
  const handleTabSelect = (_event: React.MouseEvent<HTMLElement>, tabIndex: number | string) => {
    const idx = tabIndex as number
    const item = visibleItems[idx]
    if (item && (item.element || item.children?.length)) {
      // Navigate to the item's path or first enabled child's path
      if (item.children?.length) {
        // Find first enabled child (one with an element)
        const firstEnabledChild = item.children.find((child) => !!child.element)
        if (firstEnabledChild) {
          setLocation(firstEnabledChild.path)
        } else if (item.path) {
          // If no enabled children, navigate to parent path
          setLocation(item.path)
        }
      } else if (item.path) {
        setLocation(item.path)
      }
    }
  }

  // Handle tab selection for sub-nav
  const handleSubtabSelect = (_event: React.MouseEvent<HTMLElement>, tabIndex: number | string) => {
    const idx = tabIndex as number
    const item = visibleChildren[idx]
    // Only navigate if item exists and is enabled (has an element)
    if (item && item.element) {
      setLocation(item.path)
    }
  }

  // Check if current active tab has children (should show subtabs)
  // Only shows subtabs if activeTopNavItem was found (which requires path to start with '/' + activeTopLevel + '/')
  // This naturally excludes Automations since its path is exactly '/automations', not '/automations/...'
  const shouldShowSubtabs = activeTopNavItem?.children && activeTopNavItem.children.length > 0

  return (
    <>
      <CompassPanel isPill hasNoPadding>
        <Tabs
          activeKey={activeTopIndex >= 0 ? activeTopIndex : 0}
          isNav
          onSelect={handleTabSelect}
          component={TabsComponent.nav}
          aria-label="Main navigation"
          inset={{ default: 'insetXl' }}
        >
          {visibleItems.map((item, index) => {
            // Only the active tab with children should have tabContentId/tabContentRef
            const isActiveTabWithSubtabs = index === activeTopIndex && shouldShowSubtabs
            return (
              <Tab
                key={item.label}
                tabContentId={isActiveTabWithSubtabs ? 'subtabs' : undefined}
                tabContentRef={isActiveTabWithSubtabs ? subTabsRef : undefined}
                eventKey={index}
                title={<TabTitleText>{item.label}</TabTitleText>}
                isDisabled={!item.element && !item.children?.length}
              />
            )
          })}
        </Tabs>
      </CompassPanel>
      {shouldShowSubtabs && visibleChildren.length > 0 && (
        <CompassPanel isPill hasNoPadding glass>
          <TabContent id="subtabs" ref={subTabsRef}>
            <Tabs
              activeKey={
                activeSubtabIndex >= 0
                  ? activeSubtabIndex
                  : (() => {
                      const firstEnabledIndex = visibleChildren.findIndex((child) => !!child.element)
                      return firstEnabledIndex >= 0 ? firstEnabledIndex : 0
                    })()
              }
              isSubtab
              isNav
              onSelect={handleSubtabSelect}
              aria-label="Sub navigation"
              inset={{ default: 'insetXl' }}
            >
              {visibleChildren.map((item, index) => (
                <Tab
                  key={item.label}
                  eventKey={index}
                  title={<TabTitleText>{item.label}</TabTitleText>}
                  isDisabled={!item.element}
                />
              ))}
            </Tabs>
          </TabContent>
        </CompassPanel>
      )}
    </>
  )
}
