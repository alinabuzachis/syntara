import { useEffect, useMemo, type ReactNode } from 'react'

import { type BrandConfig, defaultBrandConfig } from './brandConfig'
import { BrandContext } from './BrandContext'

type BrandProviderProps = {
  children: ReactNode
  config?: BrandConfig
}

export function BrandProvider({ children, config }: Readonly<BrandProviderProps>) {
  const value = useMemo(() => config ?? defaultBrandConfig, [config])

  useEffect(() => {
    const root = document.documentElement
    if (value.shellTheme === 'felt') {
      root.classList.add('pf-v6-theme-felt')
    }
    return () => {
      root.classList.remove('pf-v6-theme-felt')
    }
  }, [value.shellTheme])

  // index.html already has the community favicon; keep this so runtime/downstream
  // faviconPath overrides still update the tab icon when BrandProvider remounts config.
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (link) {
      link.href = value.faviconPath
    }
  }, [value.faviconPath])

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>
}
