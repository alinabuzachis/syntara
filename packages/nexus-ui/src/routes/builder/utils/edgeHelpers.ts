import { EdgeHandleEnum } from '@ansible/nexus-contracts'

/**
 * Checks if a handle is a conditional branch handle (true/false).
 */
export function isConditionalHandle(handle: string | undefined): boolean {
  return !!handle && ([EdgeHandleEnum.TRUE, EdgeHandleEnum.FALSE] as string[]).includes(handle)
}

/**
 * Checks if a handle is an approval branch handle (approved/rejected).
 */
export function isApprovalHandle(handle: string | undefined): boolean {
  return !!handle && ([EdgeHandleEnum.APPROVED, EdgeHandleEnum.REJECTED] as string[]).includes(handle)
}

/**
 * Checks if a handle is a loop handle (loop/done).
 */
export function isLoopHandle(handle: string | undefined): boolean {
  return !!handle && ([EdgeHandleEnum.LOOP, EdgeHandleEnum.DONE] as string[]).includes(handle)
}

/**
 * Checks if a handle is a branch handle (requires specific edge ID).
 * Branch handles include condition (true/false), approval (approved/rejected), and loop (loop/done) handles.
 */
export function isBranchHandle(handle: string | undefined): boolean {
  return isConditionalHandle(handle) || isApprovalHandle(handle) || isLoopHandle(handle)
}

/**
 * Generates a button edge ID based on the source node and optional handle.
 * Branch handles (condition/approval) get handle-specific IDs, others get a simple ID.
 *
 * @param sourceNodeId - The ID of the source node
 * @param sourceHandle - Optional source handle (for branching nodes)
 * @returns The button edge ID string
 *
 * @example
 * getButtonEdgeId('node-1') // 'button-node-1'
 * getButtonEdgeId('node-1', EdgeHandleEnum.TRUE) // 'button-node-1-true'
 * getButtonEdgeId('node-1', EdgeHandleEnum.APPROVED) // 'button-node-1-approved'
 */
export function getButtonEdgeId(sourceNodeId: string, sourceHandle?: string): string {
  return isBranchHandle(sourceHandle) ? `button-${sourceNodeId}-${sourceHandle}` : `button-${sourceNodeId}`
}

/**
 * Generates a placeholder node ID based on the source node and optional handle.
 * Branch handles (condition/approval) get handle-specific IDs, others get a simple ID.
 *
 * @param sourceNodeId - The ID of the source node
 * @param sourceHandle - Optional source handle (for branching nodes)
 * @returns The placeholder node ID string
 *
 * @example
 * getPlaceholderNodeId('node-1') // 'placeholder-node-1'
 * getPlaceholderNodeId('node-1', EdgeHandleEnum.TRUE) // 'placeholder-node-1-true'
 * getPlaceholderNodeId('node-1', EdgeHandleEnum.APPROVED) // 'placeholder-node-1-approved'
 */
export function getPlaceholderNodeId(sourceNodeId: string, sourceHandle?: string): string {
  return isBranchHandle(sourceHandle) ? `placeholder-${sourceNodeId}-${sourceHandle}` : `placeholder-${sourceNodeId}`
}

/**
 * Generates a pending target node ID for a source node.
 *
 * @param sourceNodeId - The ID of the source node
 * @returns The pending target node ID string
 *
 * @example
 * getPendingTargetNodeId('node-1') // 'pending-target-node-1'
 */
export function getPendingTargetNodeId(sourceNodeId: string): string {
  return `pending-target-${sourceNodeId}`
}

/**
 * Generates a pending edge ID for a source node.
 *
 * @param sourceNodeId - The ID of the source node
 * @returns The pending edge ID string
 *
 * @example
 * getPendingEdgeId('node-1') // 'pending-node-1'
 */
export function getPendingEdgeId(sourceNodeId: string): string {
  return `pending-${sourceNodeId}`
}
