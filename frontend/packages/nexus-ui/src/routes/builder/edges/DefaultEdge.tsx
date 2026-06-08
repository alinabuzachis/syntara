import { getBezierPath, useStore } from '@xyflow/react'

import { EdgeActions } from './EdgeActions'
import { EdgeLabel } from './EdgeLabel'
import { EdgePath } from './EdgePath'
import { adjustEdgeCoordinates } from './edgeUtils'
import type { BaseEdgeProps } from './types'
import { useEdgeHandlers } from './useEdgeHandlers'

/**
 * Default edge component with bezier curve
 * This is the standard edge used for normal workflow connections
 */
export function DefaultEdge(props: BaseEdgeProps) {
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
    sourceHandleId,
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
        markerEnd={data?.isPending ? "url('#hover-arrow-marker')" : effectiveMarkerEnd}
        style={style}
        selected={selected}
        isEdgeHovered={isEdgeHovered}
        data={data}
        sourceHandle={sourceHandleId}
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
