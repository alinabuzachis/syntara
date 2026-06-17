import { useContext } from 'react'

import { NodeFormTabBarContext } from './nodeFormTabBarContextDef'

export function useNodeFormTabBar() {
  const context = useContext(NodeFormTabBarContext)
  return context?.tabBarAction
}
