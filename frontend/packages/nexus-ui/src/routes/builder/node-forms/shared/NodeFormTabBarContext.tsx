import { useMemo } from 'react'
import type { ReactNode } from 'react'

import { NodeFormTabBarContext } from './nodeFormTabBarContextDef'

export function NodeFormTabBarProvider({ children, tabBarAction }: { children: ReactNode; tabBarAction?: ReactNode }) {
  const value = useMemo(() => ({ tabBarAction }), [tabBarAction])
  return <NodeFormTabBarContext.Provider value={value}>{children}</NodeFormTabBarContext.Provider>
}
