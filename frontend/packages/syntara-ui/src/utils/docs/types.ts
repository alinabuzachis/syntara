import docsUrls from './docsUrls.json' with { type: 'json' }

export type DocKey = keyof typeof docsUrls

export type DocsUrlMap = Record<DocKey, string>
