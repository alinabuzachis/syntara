import { useContext } from 'react'

import { DocLinkContext } from './docLinkContext'
import docsConfig from './docsConfig.json' with { type: 'json' }
import docsUrls from './docsUrls.json' with { type: 'json' }
import type { DocKey, DocsUrlMap } from './types'

export function useDocLink(key: DocKey): string {
  const { mode, version } = useContext(DocLinkContext)

  const paths = (docsUrls as DocsUrlMap)[key]
  const path = paths[mode] ?? paths.upstream
  const baseUrl = docsConfig.baseUrls[mode] ?? docsConfig.baseUrls.upstream

  const resolvedBase = baseUrl.replace('{version}', version)

  return `${resolvedBase}${path}`
}
