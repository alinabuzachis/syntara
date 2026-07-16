import { createContext } from 'react'

import type { AppMode } from '../appMode'

import docsConfig from './docsConfig.json' with { type: 'json' }

export type DocLinkContextValue = {
  mode: AppMode
  version: string
}

export const DocLinkContext = createContext<DocLinkContextValue>({
  mode: 'upstream',
  version: docsConfig.version,
})
