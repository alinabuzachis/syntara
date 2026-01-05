import { BaseEdge, EdgeLabelRenderer, useReactFlow, type EdgeProps, Position } from '@xyflow/react'
import { Trash2 } from 'lucide-react'
import React from 'react'

import { getEffectiveMarkerEnd } from './edgeMarkers'
import { adjustSourceCoordinates } from './edgeUtils'
import { useEdgeHover, useEdgeSourceHandle } from './useEdgeHover'

interface LoopBackEdgeProps extends EdgeProps {
  data?: {
    onAddNode?: (sourceNodeId: string, targetNodeId: string, edgeId: string, sourceHandle?: string) => void
    isActive?: boolean
    isPending?: boolean
  }
}

/**
 * Loop-back edge component with custom path routing
 * This edge type is optimized for connections that loop back to a loop node's end handle
 * Routes the edge below the loop body nodes for clear visual flow
 */
export function LoopBackEdge(props: LoopBackEdgeProps) {
  const { sourceX, sourceY, targetX, targetY, label, style, id, source, target, data, markerEnd, selected } = props
  const reactFlowInstance = useReactFlow()
  const { setEdges, getNodes } = reactFlowInstance

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

  // Calculate vertical offset dynamically based on nodes in the loop body
  // Find the loop node (target of this edge)
  const targetNode = getNodes().find((n) => n.id === target)
  const sourceNode = getNodes().find((n) => n.id === source)

  // Calculate the maximum bottom position of the source node and any nodes between source and target
  // This ensures the edge goes below all loop body nodes
  let maxBottomY = sourceY

  if (targetNode && sourceNode) {
    // Always include the source node itself (the last node in the loop body)
    const sourceBottom = sourceNode.position.y + (sourceNode.measured?.height ?? 0)
    maxBottomY = Math.max(maxBottomY, sourceBottom)

    // Also check for any other nodes between target and source
    const allNodes = getNodes()
    const loopBodyNodes = allNodes.filter((node) => {
      if (!node.position || !node.measured?.height) return false
      if (node.id === source || node.id === target) return false // Already handled
      const nodeY = node.position.y + node.measured.height / 2
      const nodeX = node.position.x
      // Nodes at similar Y level to target/source and between them horizontally
      return (
        Math.abs(nodeY - targetY) < 100 && // Similar Y level (within 100px)
        nodeX > targetX && // To the right of target (loop node)
        nodeX < sourceX // To the left of source (last node in loop)
      )
    })

    // Find the maximum bottom edge of these nodes
    loopBodyNodes.forEach((node) => {
      const nodeBottom = node.position.y + (node.measured?.height ?? 0)
      maxBottomY = Math.max(maxBottomY, nodeBottom)
    })
  }

  const { x: adjustedSourceX, y: adjustedSourceY } = adjustSourceCoordinates(sourceX, sourceY, Position.Right)

  // Add padding below the lowest node for clear visual separation
  // Use moderate padding to avoid excessive whitespace
  // Calculate vertical offset using adjusted sourceY to maintain correct spacing
  const verticalOffset = Math.max(40, maxBottomY - adjustedSourceY + 20)

  // Calculate the path with rounded corners for better visual flow:
  // 1. Go right from source
  // 2. Drop down below the nodes
  // 3. Route horizontally back to target X
  // 4. Come up to target
  const cornerRadius = 8
  const horizontalOffset = 15

  const edgePath = `
    M ${adjustedSourceX},${adjustedSourceY}
    L ${adjustedSourceX + horizontalOffset - cornerRadius},${adjustedSourceY}
    Q ${adjustedSourceX + horizontalOffset},${adjustedSourceY} ${adjustedSourceX + horizontalOffset},${adjustedSourceY + cornerRadius}
    L ${adjustedSourceX + horizontalOffset},${adjustedSourceY + verticalOffset - cornerRadius}
    Q ${adjustedSourceX + horizontalOffset},${adjustedSourceY + verticalOffset} ${adjustedSourceX + horizontalOffset - cornerRadius},${adjustedSourceY + verticalOffset}
    L ${targetX - horizontalOffset + cornerRadius},${adjustedSourceY + verticalOffset}
    Q ${targetX - horizontalOffset},${adjustedSourceY + verticalOffset} ${targetX - horizontalOffset},${adjustedSourceY + verticalOffset - cornerRadius}
    L ${targetX - horizontalOffset},${targetY + cornerRadius}
    Q ${targetX - horizontalOffset},${targetY} ${targetX - horizontalOffset + cornerRadius},${targetY}
    L ${targetX},${targetY}
  `

  // Position label in the middle of the horizontal bottom segment
  // Use adjusted coordinates for consistency with the edge path
  const labelX = (adjustedSourceX + targetX) / 2
  const labelY = adjustedSourceY + verticalOffset

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
      {/* Visible edge with bezier curve routing */}
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
      {/* Invisible wider path for hover detection */}
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
