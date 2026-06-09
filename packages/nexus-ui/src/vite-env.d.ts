/// <reference types="vite/client" />

type ImportMetaEnv = {
  readonly VITE_DOC_MODE?: 'upstream' | 'product'
}

declare module '*.svg?react' {
  import type { FC, SVGProps } from 'react'
  const ReactComponent: FC<SVGProps<SVGSVGElement>>
  export default ReactComponent
}
