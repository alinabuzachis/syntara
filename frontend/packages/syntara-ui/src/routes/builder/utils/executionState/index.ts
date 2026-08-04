/**
 * Execution state management module.
 *
 * This module provides centralized logic for enriching workflow activities with execution
 * state for visualization purposes. All execution state (including control flow nodes) is
 * provided by the backend and mapped to workflow nodes for display.
 *
 * Main exports:
 * - ExecutionStateEnricher: Orchestrator class that enriches activities with execution state
 * - ActivityWithMetadata: Type for activities enriched with execution metadata
 * - Constants: Branch handles and activity type constants
 * - Utilities: Helper functions for execution state (isTerminalState, isBranchHandle)
 */

export type { ActivityTypeValue, ActivityStatusValue, BranchHandle } from './executionHelpers'
export { collectCopiedRunActivityIds } from './collectCopiedRunActivityIds'
export {
  ExecutionStateEnricher,
  type ActivityWithMetadata,
  type EnrichActivityOptions,
  type ExecutionState,
} from './ExecutionStateEnricher'
