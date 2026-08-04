/// <reference types="vite/client" />

type ImportMetaEnv = {
  /**
   * Build variant gate. Unset (or any value other than `true`/`1`) = community
   * (open-source upstream). Set to `true` or `1` for extended builds that
   * inject overlay files and a custom app title before `vite build`.
   * Controls docs URL resolution, app title, and any variant-specific UI.
   */
  readonly VITE_EXTENDED?: string
  /**
   * Product display title. Honored only when `VITE_EXTENDED` is true/1.
   * Community builds always use `Syntara` even if this is set.
   * Set by extended builds; absent in community builds.
   */
  readonly VITE_APP_TITLE?: string
  /** @deprecated Ignored — use `VITE_EXTENDED`. */
  readonly VITE_DOC_MODE?: string
  /** @deprecated Ignored — use `VITE_EXTENDED`. */
  readonly VITE_APP_MODE?: string
}

declare module '*.svg?react' {
  import type { FC, SVGProps } from 'react'
  const ReactComponent: FC<SVGProps<SVGSVGElement>>
  export default ReactComponent
}
