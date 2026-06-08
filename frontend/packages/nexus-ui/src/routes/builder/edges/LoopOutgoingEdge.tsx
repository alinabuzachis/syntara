import { getSmoothStepPath } from '@xyflow/react'

import { EdgeActions } from './EdgeActions'
import { EdgeLabel } from './EdgeLabel'
import { EdgePath } from './EdgePath'
import { adjustEdgeCoordinates } from './edgeUtils'
import type { BaseEdgeProps } from './types'
import { useEdgeHandlers } from './useEdgeHandlers'

/**
 * Loop outgoing edge component with smooth step path
 * This edge type is optimized for connections from a loop node's loop handle to nodes in the loop body
 * Uses smooth step routing with horizontal and vertical segments for clear visual flow
 */
export function LoopOutgoingEdge(props: BaseEdgeProps) {
  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    label,
    style,
    id,
    source,
    target,
    data,
    markerEnd,
    selected,
  } = props
  const {
    isHovered,
    isEdgeHovered,
    effectiveMarkerEnd,
    handleEdgeMouseEnter,
    handleEdgeMouseLeave,
    handleButtonMouseEnter,
    handleButtonMouseLeave,
    handleDelete,
    handleAddNode,
  } = useEdgeHandlers({
    edgeId: id,
    source,
    target,
    markerEnd,
    selected,
    data,
  })

  const {
    sourceX: adjustedSourceX,
    sourceY: adjustedSourceY,
    targetX: adjustedTargetX,
    targetY: adjustedTargetY,
  } = adjustEdgeCoordinates({ sourceX, sourceY, sourcePosition, targetX, targetY })

  // Use smooth step path for loop outgoing routing with rounded corners
  // Increase offset to provide more spacing between loop handle and first node in loop body
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX: adjustedSourceX,
    sourceY: adjustedSourceY,
    sourcePosition,
    targetX: adjustedTargetX,
    targetY: adjustedTargetY,
    targetPosition,
    borderRadius: 8,
  })

  return (
    <>
      <EdgePath
        edgePath={edgePath}
        markerEnd={effectiveMarkerEnd}
        style={style}
        selected={selected}
        isEdgeHovered={isEdgeHovered}
        data={data}
        onMouseEnter={handleEdgeMouseEnter}
        onMouseLeave={handleEdgeMouseLeave}
      />
      <EdgeLabel labelX={labelX} labelY={labelY} label={label} />
      {(isHovered || data?.isActive) && !data?.isPending && !data?.executionStatus && (
        <EdgeActions
          labelX={labelX}
          labelY={labelY}
          onButtonMouseEnter={handleButtonMouseEnter}
          onButtonMouseLeave={handleButtonMouseLeave}
          onAddNode={handleAddNode}
          onDelete={handleDelete}
        />
      )}
    </>
  )
}
