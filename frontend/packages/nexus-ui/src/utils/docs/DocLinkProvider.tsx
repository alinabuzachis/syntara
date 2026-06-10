import { useMemo, type ReactNode } from 'react'

import { DocLinkContext, type DocLinkContextValue } from './docLinkContext'
import docsConfig from './docsConfig.json'
import type { DocMode } from './types'

function resolveDocMode(): DocMode {
  const raw: unknown = import.meta.env.VITE_DOC_MODE
  if (raw === 'product') {
    return 'product'
  }
  return 'upstream'
}

export function DocLinkProvider(props: Readonly<{ children: ReactNode }>) {
  const value = useMemo<DocLinkContextValue>(
    () => ({
      mode: resolveDocMode(),
      version: docsConfig.version,
    }),
    []
  )

  return <DocLinkContext.Provider value={value}>{props.children}</DocLinkContext.Provider>
}
