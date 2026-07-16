/// <reference types="vite/client" />

type ImportMetaEnv = {
  readonly VITE_APP_MODE?: 'upstream' | 'product'
  /** @deprecated Use VITE_APP_MODE instead. Retained for backwards compatibility with product build pipelines. */
  readonly VITE_DOC_MODE?: 'upstream' | 'product'
  /**
   * Product title. Injected from `.env.local` pre-build by CI; absent in upstream/open-source builds.
   * Fallback: `'Nexus'`. Must be `string | undefined` — typing as `string` would mask missing fallbacks.
   */
  readonly VITE_APP_TITLE?: string
}

declare module '*.svg?react' {
  import type { FC, SVGProps } from 'react'
  const ReactComponent: FC<SVGProps<SVGSVGElement>>
  export default ReactComponent
}
