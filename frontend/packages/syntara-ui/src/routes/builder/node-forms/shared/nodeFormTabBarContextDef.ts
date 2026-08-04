import { createContext } from 'react'
import type { ReactNode } from 'react'

export type NodeFormTabBarContextValue = {
  tabBarAction?: ReactNode
}

export const NodeFormTabBarContext = createContext<NodeFormTabBarContextValue | null>(null)
