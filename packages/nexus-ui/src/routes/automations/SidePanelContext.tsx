import { createContext, type ReactNode } from 'react'

export const SidePanelContext = createContext<[ReactNode, React.Dispatch<React.SetStateAction<ReactNode>>]>([
  null,
  () => {},
])
