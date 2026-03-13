import { createContext, useContext } from 'react'

/**
 * Context value providing node-level actions available in the builder.
 *
 * Consumed by useNodeMenuActions to wire up the kebab menu items that
 * require cross-component communication (panel open/close state lives
 * in BuilderContent, while the menu lives deep inside node components).
 */
export interface NodeActionsContextValue {
  /** Open the node editor panel for the given node ID. */
  onViewDetails: (nodeId: string) => void
  /** Open the add-node panel in replacement mode for the given node ID. */
  onReplace: (nodeId: string) => void
  /** Duplicate the activity and place the copy near the original on the canvas. */
  onDuplicate: (nodeId: string) => void
}

/**
 * Context that bridges node kebab-menu actions to BuilderContent state.
 *
 * Provided by BuilderContent; null when rendered outside the builder
 * (e.g. execution view), which causes useNodeMenuActions to omit the
 * builder-specific actions automatically.
 */
export const NodeActionsContext = createContext<NodeActionsContextValue | null>(null)

/**
 * Returns the NodeActionsContext value, or null when used outside the builder.
 *
 * @example
 * const nodeActions = useNodeActions()
 * nodeActions?.onViewDetails(nodeId)
 */
export function useNodeActions(): NodeActionsContextValue | null {
  return useContext(NodeActionsContext)
}
