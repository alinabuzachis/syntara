/**
 * Execution state management module.
 *
 * This module provides centralized logic for inferring and enriching workflow activities
 * with execution state for visualization purposes. It uses a strategy pattern to handle
 * different node types (loop, converge, conditional) independently.
 *
 * Main exports:
 * - ExecutionStateEnricher: Orchestrator class that enriches activities with execution state
 * - ActivityWithMetadata: Type for activities enriched with execution metadata
 * - Constants: Branch handles and activity type constants
 */

export { ACTIVITY_TYPES, BRANCH_HANDLES, isBranchHandle, type ActivityTypeValue, type BranchHandle } from './constants'
export { ExecutionStateEnricher, type ActivityWithMetadata } from './ExecutionStateEnricher'
export type { ExecutionState, NodeStateInferrer } from './nodeStateInference'
