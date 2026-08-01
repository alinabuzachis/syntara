import { createContext, use } from 'react'

const VersionViewContext = createContext(false)

export const VersionViewProvider = VersionViewContext.Provider

export function useIsVersionView(): boolean {
  return use(VersionViewContext)
}
