import { BaseEdge, EdgeLabelRenderer, useReactFlow, type EdgeProps } from '@xyflow/react'
import { Trash2 } from 'lucide-react'
import React, { useEffect, useState } from 'react'

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

  const fullEdge = reactFlowInstance.getEdge(id)
  const actualSourceHandle = fullEdge?.sourceHandle
  const [isHovered, setIsHovered] = useState(false)
  const [isEdgeHovered, setIsEdgeHovered] = useState(false)
  const [isAddButtonHovered, setIsAddButtonHovered] = useState(false)
  const hoverTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // Switch to a custom marker ID when selected, hovered, or active
  const effectiveMarkerEnd = selected
    ? "url('#selected-arrow-marker')"
    : isEdgeHovered || data?.isActive
      ? "url('#hover-arrow-marker')"
      : markerEnd

  // Calculate vertical offset dynamically based on nodes in the loop body
  // Find the loop node (target of this edge)
  const targetNode = getNodes().find((n) => n.id === target)
  const sourceNode = getNodes().find((n) => n.id === source)

  // Calculate the maximum bottom position of nodes between source and target
  // This ensures the edge goes below all loop body nodes
  let maxBottomY = sourceY

  if (targetNode && sourceNode) {
    const allNodes = getNodes()
    // Find nodes that are in the loop body (between source X and target X, same Y level)
    const loopBodyNodes = allNodes.filter((node) => {
      if (!node.position || !node.measured?.height) return false
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

  // Add padding below the lowest node (very compact)
  const verticalOffset = maxBottomY - sourceY + 20

  // Calculate the path:
  // 1. Go right from source
  // 2. Drop down below the nodes
  // 3. Route horizontally back to target X
  // 4. Come up to target
  const edgePath = `
    M ${sourceX},${sourceY}
    L ${sourceX + 10},${sourceY}
    L ${sourceX + 10},${sourceY + verticalOffset}
    L ${targetX - 10},${sourceY + verticalOffset}
    L ${targetX - 10},${targetY}
    L ${targetX},${targetY}
  `

  // Position label in the middle of the horizontal bottom segment
  const labelX = (sourceX + targetX) / 2
  const labelY = sourceY + verticalOffset

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
      }
    }
  }, [])

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
      {/* Define custom markers for selected and hover states */}
      <defs>
        <marker
          id="selected-arrow-marker"
          markerWidth="12"
          markerHeight="12"
          viewBox="-10 -10 20 20"
          orient="auto"
          refX="0"
          refY="0"
        >
          <polyline
            stroke="#e5e7eb"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1"
            fill="#e5e7eb"
            points="-5,-4 0,0 -5,4 -5,-4"
          />
        </marker>
        <marker
          id="hover-arrow-marker"
          markerWidth="12"
          markerHeight="12"
          viewBox="-10 -10 20 20"
          orient="auto"
          refX="0"
          refY="0"
        >
          <polyline
            stroke="#e5e7eb"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1"
            fill="#e5e7eb"
            points="-5,-4 0,0 -5,4 -5,-4"
          />
        </marker>
      </defs>
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
          onMouseEnter={() => {
            if (hoverTimeoutRef.current) {
              clearTimeout(hoverTimeoutRef.current)
              hoverTimeoutRef.current = null
            }
            setIsHovered(true)
            setIsEdgeHovered(true)
          }}
          onMouseLeave={() => {
            setIsEdgeHovered(false)
            hoverTimeoutRef.current = setTimeout(() => {
              setIsHovered(false)
            }, 200)
          }}
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
            }}
            className="nodrag nopan"
            onMouseEnter={() => {
              if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current)
                hoverTimeoutRef.current = null
              }
              setIsHovered(true)
              setIsEdgeHovered(true)
            }}
            onMouseLeave={() => {
              setIsEdgeHovered(false)
              hoverTimeoutRef.current = setTimeout(() => {
                setIsHovered(false)
              }, 200)
            }}
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
