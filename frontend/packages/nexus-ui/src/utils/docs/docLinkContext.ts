import { createContext } from 'react'

import type { AppMode } from '../appMode'

import { docsConfig } from './loadDocsConfig'

export type DocLinkContextValue = {
  mode: AppMode
  version: string
}

export const DocLinkContext = createContext<DocLinkContextValue>({
  mode: 'community',
  version: docsConfig.version,
})
