import type { NodeMouseHandler } from '@xyflow/react'

import type { NodeType } from '../automations/canvas/nodes/NodeType'

/**
 * Props for the BuilderFlow component
 */
export interface BuilderFlowProps {
  /** Workflow ID from route params (null for new workflows) */
  workflowId?: string | null
  /** Counter to trigger layout re-calculation */
  triggerLayout?: number
  /** Whether the side panel is open */
  panelOpen?: boolean
  /** ID of the node whose button edge is currently active */
  activeEdgeButtonNodeId?: string | null
  /** Handle ID of the active button edge (for condition nodes: 'true' or 'false') */
  activeEdgeButtonHandle?: string | null
  /** ID of the currently active edge */
  activeEdgeId?: string | null
  /** Execution status for showing loading indicator */
  executionStatus?: string | null
  /** Handler for node click events */
  onNodeClick?: NodeMouseHandler<NodeType>
  /** Handler for adding a node from an edge */
  onAddNodeFromEdge?: (sourceNodeId: string, targetNodeId?: string, edgeId?: string, sourceHandle?: string) => void
  /** Handler called after nodes are deleted */
  onNodesDeleted?: (deletedNodeIds: string[]) => void
}

/**
 * State for tracking connection attempts when dragging from a node
 */
export interface ConnectionState {
  sourceNodeId: string | null
  sourceHandleId: string | null
  successful: boolean
}

/**
 * Pending edge state when dragging from a node to the canvas
 */
export interface PendingEdge {
  sourceNodeId: string
  sourceHandle?: string
  x: number
  y: number
}
