import { useMemo, type ReactNode } from 'react'

import { resolveAppMode } from '../appMode'

import { DocLinkContext, type DocLinkContextValue } from './docLinkContext'
import { docsConfig } from './loadDocsConfig'

export function DocLinkProvider(props: Readonly<{ children: ReactNode }>) {
  const value = useMemo<DocLinkContextValue>(
    () => ({
      mode: resolveAppMode(),
      version: docsConfig.version,
    }),
    []
  )

  return <DocLinkContext.Provider value={value}>{props.children}</DocLinkContext.Provider>
}
