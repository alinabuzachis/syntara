import { createContext, useContext } from 'react'

const VersionViewContext = createContext(false)

export const VersionViewProvider = VersionViewContext.Provider

export function useIsVersionView(): boolean {
  return useContext(VersionViewContext)
}
