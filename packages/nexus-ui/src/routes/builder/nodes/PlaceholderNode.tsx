import { Handle, Position } from '@xyflow/react'

/**
 * Invisible placeholder node used as a target for ButtonEdge components.
 * This node is not meant to be visible - it exists only to satisfy React Flow's
 * requirement that all edges must have valid source and target nodes.
 */
export function PlaceholderNode() {
  // Must have actual dimensions for React Flow to measure it, but make it invisible
  return (
    <div
      style={{
        width: '10px',
        height: '10px',
        opacity: 0,
        pointerEvents: 'none',
      }}
    >
      <Handle type="target" position={Position.Left} id="target" style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="source" position={Position.Right} id="source" style={{ opacity: 0, pointerEvents: 'none' }} />
    </div>
  )
}
