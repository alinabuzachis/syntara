import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, type EdgeProps } from '@xyflow/react'
import { Trash2 } from 'lucide-react'
import React from 'react'

import { getEffectiveMarkerEnd } from './edgeMarkers'
import { adjustEdgeCoordinates } from './edgeUtils'
import { useEdgeHover, useEdgeSourceHandle } from './useEdgeHover'

interface DefaultEdgeProps extends EdgeProps {
  data?: {
    onAddNode?: (sourceNodeId: string, targetNodeId: string, edgeId: string, sourceHandle?: string) => void
    isActive?: boolean
    isPending?: boolean
  }
}

/**
 * Default edge component with bezier curve
 * This is the standard edge used for normal workflow connections
 */
export function DefaultEdge(props: DefaultEdgeProps) {
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
  const reactFlowInstance = useReactFlow()
  const { setEdges } = reactFlowInstance

  const actualSourceHandle = useEdgeSourceHandle(id)
  const {
    isHovered,
    isEdgeHovered,
    isAddButtonHovered,
    setIsAddButtonHovered,
    handleEdgeMouseEnter,
    handleEdgeMouseLeave,
    handleButtonMouseEnter,
    handleButtonMouseLeave,
  } = useEdgeHover()

  const effectiveMarkerEnd = getEffectiveMarkerEnd(selected, isEdgeHovered, data?.isActive, markerEnd)

  // Adjust coordinates to account for handle position at visual edge
  const {
    sourceX: adjustedSourceX,
    sourceY: adjustedSourceY,
    targetX: adjustedTargetX,
    targetY: adjustedTargetY,
  } = adjustEdgeCoordinates(sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition)

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: adjustedSourceX,
    sourceY: adjustedSourceY,
    sourcePosition,
    targetX: adjustedTargetX,
    targetY: adjustedTargetY,
    targetPosition,
  })

  const handleDelete = (event: React.MouseEvent) => {
    event.stopPropagation()
    setEdges((edges) => edges.filter((edge) => edge.id !== id))
  }

  const handleAddNode = (event: React.MouseEvent) => {
    event.stopPropagation()
    data?.onAddNode?.(source, target, id, actualSourceHandle ?? undefined)
  }

  return (
    <>
      {/* Visible edge with same style as button edge */}
      <BaseEdge
        path={edgePath}
        markerEnd={effectiveMarkerEnd}
        style={{
          ...style,
          stroke: selected || isEdgeHovered || data?.isActive ? '#e5e7eb' : '#6b7280',
          strokeWidth: 2,
          pointerEvents: 'none',
          filter:
            selected || isEdgeHovered || data?.isActive ? 'drop-shadow(0 0 4px rgba(255, 255, 255, 0.2))' : 'none',
        }}
      />
      {/* Invisible wider path for hover detection - rendered after so it's on top */}
      {!data?.isPending && (
        <path
          d={edgePath}
          fill="none"
          stroke="transparent"
          strokeWidth={20}
          onMouseEnter={handleEdgeMouseEnter}
          onMouseLeave={handleEdgeMouseLeave}
          style={{ pointerEvents: 'stroke' }}
        />
      )}
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 12,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
      {(isHovered || data?.isActive) && !data?.isPending && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -120%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              display: 'flex',
              zIndex: 1000,
            }}
            className="nodrag nopan"
            onMouseEnter={handleButtonMouseEnter}
            onMouseLeave={handleButtonMouseLeave}
          >
            <button
              onClick={handleAddNode}
              style={{
                cursor: 'pointer',
                padding: 'var(--pf-t--global--spacer--xs)',
                color: data?.isActive
                  ? 'var(--pf-t--global--color--text--primary)'
                  : 'var(--pf-t--global--color--text--muted)',
              }}
              onMouseEnter={(e) => {
                setIsAddButtonHovered(true)
                if (!data?.isActive) {
                  e.currentTarget.style.color = 'var(--pf-t--global--color--text--primary)'
                }
              }}
              onMouseLeave={(e) => {
                setIsAddButtonHovered(false)
                if (!data?.isActive) {
                  e.currentTarget.style.color = 'var(--pf-t--global--color--text--muted)'
                }
              }}
              title="Add node"
            >
              <svg
                width="14"
                height="14"
                viewBox="-7 -7 14 14"
                style={{
                  pointerEvents: 'none',
                  filter:
                    isAddButtonHovered || data?.isActive
                      ? 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.8)) drop-shadow(0 0 12px rgba(255, 255, 255, 0.6))'
                      : 'none',
                }}
              >
                <rect x={-7} y={-7} width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5} rx={2} />
                <line x1={-4} y1={0} x2={4} y2={0} stroke="currentColor" strokeWidth={1.5} />
                <line x1={0} y1={-4} x2={0} y2={4} stroke="currentColor" strokeWidth={1.5} />
              </svg>
            </button>
            <button
              onClick={handleDelete}
              style={{
                cursor: 'pointer',
                padding: 'var(--pf-t--global--spacer--xs)',
                color: 'var(--pf-t--global--color--text--muted)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--pf-t--global--color--text--primary)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--pf-t--global--color--text--muted)'
              }}
              title="Delete edge"
            >
              <Trash2 style={{ width: '0.875rem', height: '0.875rem', pointerEvents: 'none' }} />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
