import { Tabs, type TabsProps } from '@patternfly/react-core'
import { useEffect } from 'react'
import { useLocation } from 'wouter'

import { useUrlTab } from '../../hooks/useUrlTab'

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

export function NxUrlTabs({ basePath, defaultTab = 'details', validTabs, children, ...tabsProps }: UrlTabsProps) {
  // eslint-disable-next-line reactYouMightNotNeedAnEffect/no-event-handler -- basePath/defaultTab are URL segments, not handler props; goToTab is the intended navigation wrapper for this hook
  const [activeTab, goToTab] = useUrlTab(basePath, defaultTab)
  const [, setLocation] = useLocation()

  /* eslint-disable reactYouMightNotNeedAnEffect/no-event-handler, reactYouMightNotNeedAnEffect/no-pass-data-to-parent */
  // validTabs arrives asynchronously (from an API); redirect when the URL tab is absent from the
  // list is an async-prop side-effect, not a user event — useEffect is correct here.
  useEffect(() => {
    if (!validTabs || validTabs.length === 0) return
    if (!validTabs.includes(activeTab)) {
      const target = validTabs.includes(defaultTab) ? defaultTab : validTabs[0]
      setLocation(`${basePath}/${target}`, { replace: true })
    }
  }, [validTabs, activeTab, defaultTab, basePath, setLocation])
  /* eslint-enable reactYouMightNotNeedAnEffect/no-event-handler, reactYouMightNotNeedAnEffect/no-pass-data-to-parent */

  useEffect(() => {
    const blurStaleTab = () => {
      if (document.activeElement instanceof HTMLElement && document.activeElement.getAttribute('role') === 'tab') {
        document.activeElement.blur()
      }
    }
    globalThis.addEventListener('popstate', blurStaleTab)
    return () => globalThis.removeEventListener('popstate', blurStaleTab)
  }, [])

  const handleSelect = (_event: React.MouseEvent<HTMLElement, MouseEvent>, key: string | number) => {
    goToTab(String(key))
  }

  return (
    <Tabs activeKey={activeTab} onSelect={handleSelect} {...tabsProps}>
      {children}
    </Tabs>
  )
}
