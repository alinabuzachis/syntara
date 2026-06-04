import { getBezierPath, useStore } from '@xyflow/react'

import { EdgeActions } from './EdgeActions'
import { EdgeLabel } from './EdgeLabel'
import { EdgePath } from './EdgePath'
import { adjustEdgeCoordinates } from './edgeUtils'
import type { BaseEdgeProps } from './types'
import { useEdgeHandlers } from './useEdgeHandlers'

/**
 * Loop done edge component with bezier curve
 * This edge type is optimized for connections from a loop node's done handle
 * Uses bezier curve for smooth, natural routing
 */
export function LoopDoneEdge(props: BaseEdgeProps) {
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
  const nodesConnectable = useStore((s) => s.nodesConnectable)
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

  // Adjust coordinates to account for handle position at visual edge
  const {
    sourceX: adjustedSourceX,
    sourceY: adjustedSourceY,
    targetX: adjustedTargetX,
    targetY: adjustedTargetY,
  } = adjustEdgeCoordinates({ sourceX, sourceY, sourcePosition, targetX, targetY })

  // Use bezier path for smooth curved routing
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: adjustedSourceX,
    sourceY: adjustedSourceY,
    sourcePosition,
    targetX: adjustedTargetX,
    targetY: adjustedTargetY,
    targetPosition,
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
      {(isHovered || data?.isActive) && !data?.isPending && !data?.executionStatus && nodesConnectable && (
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
