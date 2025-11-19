import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, type EdgeProps } from '@xyflow/react'
import { Trash2 } from 'lucide-react'
import React, { useEffect, useState } from 'react'

interface DefaultEdgeProps extends EdgeProps {
  data?: {
    onAddNode?: (sourceNodeId: string, targetNodeId: string, edgeId: string) => void
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
  const { setEdges } = useReactFlow()
  const [isHovered, setIsHovered] = useState(false)
  const [isEdgeHovered, setIsEdgeHovered] = useState(false)
  const hoverTimeoutRef = React.useRef<number | null>(null)

  // Switch to a custom marker ID when selected or hovered
  const effectiveMarkerEnd = selected
    ? "url('#selected-arrow-marker')"
    : isEdgeHovered
      ? "url('#hover-arrow-marker')"
      : markerEnd

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

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
    data?.onAddNode?.(source, target, id)
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
      {/* Visible edge with same style as button edge */}
      <BaseEdge
        path={edgePath}
        markerEnd={effectiveMarkerEnd}
        style={{
          ...style,
          stroke: selected || isEdgeHovered ? '#e5e7eb' : '#6b7280',
          strokeWidth: 2,
          pointerEvents: 'none',
          filter: selected || isEdgeHovered ? 'drop-shadow(0 0 4px rgba(255, 255, 255, 0.2))' : 'none',
        }}
      />
      {/* Invisible wider path for hover detection - rendered after so it's on top */}
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
            <div className="rounded border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-gray-200">{label}</div>
          </div>
        </EdgeLabelRenderer>
      )}
      {isHovered && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -120%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan flex gap-1"
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
              className="flex cursor-pointer items-center justify-center rounded bg-transparent p-1 text-gray-400 transition-colors hover:text-white"
              title="Add node"
            >
              <svg width="14" height="14" viewBox="-7 -7 14 14" style={{ pointerEvents: 'none' }}>
                <rect x={-7} y={-7} width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5} rx={2} />
                <line x1={-4} y1={0} x2={4} y2={0} stroke="currentColor" strokeWidth={1.5} />
                <line x1={0} y1={-4} x2={0} y2={4} stroke="currentColor" strokeWidth={1.5} />
              </svg>
            </button>
            <button
              onClick={handleDelete}
              className="flex cursor-pointer items-center justify-center rounded bg-transparent p-1 text-gray-400 transition-colors hover:text-white"
              title="Delete edge"
            >
              <Trash2 className="size-3.5" style={{ pointerEvents: 'none' }} />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
