import { createContext, useContext } from 'react'

/**
 * Context value for step-level actions in the builder (React Flow node IDs identify steps on the canvas).
 *
 * Consumed by useNodeMenuActions to wire up the kebab menu items that
 * require cross-component communication (panel open/close state lives
 * in BuilderContent, while the menu lives deep inside canvas node components).
 */
export interface NodeActionsContextValue {
  /** Open the step editor panel for the given React Flow node ID. */
  onViewDetails: (nodeId: string) => void
  /** Open the add-step panel in replacement mode for the given React Flow node ID. */
  onReplace: (nodeId: string) => void
  /** Duplicate the activity and place the copy near the original on the canvas. */
  onDuplicate: (nodeId: string) => void
}

/**
 * Context that bridges canvas step menu actions to BuilderContent state.
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
