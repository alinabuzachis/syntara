import type docsUrls from './docsUrls.json'

export type DocKey = keyof typeof docsUrls

export type DocMode = 'upstream' | 'product'

export type DocPaths = {
  upstream: string
  product: string
}

export type DocsUrlMap = Record<DocKey, DocPaths>
