import { use } from 'react'

import { NodeFormTabBarContext } from './nodeFormTabBarContextDef'

export function useNodeFormTabBar() {
  const context = use(NodeFormTabBarContext)
  return context?.tabBarAction
}
