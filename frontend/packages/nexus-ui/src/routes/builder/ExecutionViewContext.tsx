import { createContext, use } from 'react'

/**
 * Context to track whether we're in execution view mode (read-only)
 * or builder mode (editable).
 *
 * In execution view:
 * - Nodes show execution status badges
 * - Node menus are hidden
 * - Edges don't show action buttons
 * - No interactive editing features
 */
export const ExecutionViewContext = createContext<boolean>(false)

/**
 * Hook to check if currently in execution view mode
 *
 * @returns true if in read-only execution view, false if in editable builder mode
 *
 * @example
 * const isExecutionView = useIsExecutionView()
 * if (isExecutionView) {
 *   // Hide edit menu
 * }
 */
export function useIsExecutionView(): boolean {
  return use(ExecutionViewContext)
}
