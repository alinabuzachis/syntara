import { Tabs, type TabsProps } from '@patternfly/react-core'
import { useEffect } from 'react'
import { useLocation } from 'wouter'

import { useUrlTab } from '../hooks/useUrlTab'

type UrlTabsProps = Omit<TabsProps, 'activeKey' | 'onSelect' | 'ref'> & {
  /** Base path used to derive the active tab from the URL (e.g. `/system-administration/settings`). */
  basePath: string
  /** Tab key used when the URL has no tab segment (default: `'details'`). */
  defaultTab?: string
  /**
   * When provided, the component redirects (via `replace`) to `defaultTab`
   * if the current URL tab segment is not in this list.
   * Use for pages whose tabs are loaded dynamically (e.g. from an API).
   */
  validTabs?: string[]
}

export function UrlTabs({ basePath, defaultTab = 'details', validTabs, children, ...tabsProps }: UrlTabsProps) {
  const [activeTab, goToTab] = useUrlTab(basePath, defaultTab)
  const [, setLocation] = useLocation()

  useEffect(() => {
    if (!validTabs || validTabs.length === 0) return
    if (!validTabs.includes(activeTab)) {
      const target = validTabs.includes(defaultTab) ? defaultTab : validTabs[0]
      setLocation(`${basePath}/${target}`, { replace: true })
    }
  }, [validTabs, activeTab, defaultTab, basePath, setLocation])

  const handleSelect = (_event: React.MouseEvent<HTMLElement, MouseEvent>, key: string | number) => {
    goToTab(String(key))
  }

  return (
    <Tabs activeKey={activeTab} onSelect={handleSelect} {...tabsProps}>
      {children}
    </Tabs>
  )
}
