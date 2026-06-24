import { createContext } from 'react'

import docsConfig from './docsConfig.json' with { type: 'json' }
import type { DocMode } from './types'

export type DocLinkContextValue = {
  mode: DocMode
  version: string
}

export const DocLinkContext = createContext<DocLinkContextValue>({
  mode: 'upstream',
  version: docsConfig.version,
})
