/**
 * Module-level state for communicating the intended handle ID from ButtonEdge to BuilderFlow.
 *
 * This is needed because React Flow's handle detection sometimes picks the wrong handle
 * when condition node handles have overlapping hit areas. By setting the intended handle
 * before dispatching the synthetic mousedown event, we can override React Flow's detection.
 */

let pendingDragHandle: { nodeId: string; handleId: string } | null = null

/**
 * Set the intended handle for the next drag operation.
 * Called by ButtonEdge before dispatching the synthetic mousedown event.
 */
export function setPendingDragHandle(nodeId: string, handleId: string): void {
  pendingDragHandle = { nodeId, handleId }
}

/**
 * Get and clear the pending drag handle.
 * Called by BuilderFlow's onConnectStart to override React Flow's detection if needed.
 */
export function consumePendingDragHandle(): { nodeId: string; handleId: string } | null {
  const handle = pendingDragHandle
  pendingDragHandle = null
  return handle
}
