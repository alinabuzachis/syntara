import { createContext, useContext } from 'react'

/**
 * Context to track whether there's an active (running) execution.
 * Active executions are: running, pending, paused, or waiting.
 * Terminal states (completed, failed, cancelled) are NOT active.
 *
 * When an active execution is in progress:
 * - Node clicks should not open the details panel
 * - Kebab menus should be disabled
 * - Nodes are not draggable or connectable
 * - Canvas is read-only
 */
export const ActiveExecutionContext = createContext<boolean>(false)

/**
 * Hook to check if there's currently an active execution in progress
 *
 * @returns true if there's an active execution (running/pending/paused/waiting), false otherwise
 *
 * @example
 * const isActiveExecution = useIsActiveExecution()
 * if (isActiveExecution) {
 *   // Hide menu actions
 * }
 */
export function useIsActiveExecution(): boolean {
  return useContext(ActiveExecutionContext)
}
