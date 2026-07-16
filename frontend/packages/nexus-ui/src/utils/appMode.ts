export type AppMode = 'upstream' | 'product'

export function resolveAppMode(): AppMode {
  // VITE_APP_MODE is the canonical variable. VITE_DOC_MODE is a deprecated
  // fallback retained for backwards compatibility with product build pipelines
  // that have not yet migrated. Remove the VITE_DOC_MODE fallback once the
  // product pipeline is updated.
  const raw: unknown = import.meta.env.VITE_APP_MODE ?? import.meta.env.VITE_DOC_MODE
  return raw === 'product' ? 'product' : 'upstream'
}
