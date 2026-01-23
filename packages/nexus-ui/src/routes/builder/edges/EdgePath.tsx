import type { EdgeProps, MarkerType } from '@xyflow/react'
import { BaseEdge } from '@xyflow/react'
import { useMemo } from 'react'

interface EdgePathProps {
  /** The SVG path string for the edge */
  edgePath: string
  /** The marker end for the edge (string URL or React Flow marker object) */
  markerEnd?: string | { type: MarkerType; width: number; height: number; color: string }
  /** Additional style to merge with default edge styles */
  style?: React.CSSProperties
  /** Whether the edge is selected */
  selected?: boolean
  /** Whether the edge is hovered */
  isEdgeHovered: boolean
  /** Edge data containing isActive, isPending, and executionStatus */
  data?: {
    isActive?: boolean
    isPending?: boolean
    executionStatus?: 'passed' | 'pending'
  }
  /** Mouse enter handler for hover detection */
  onMouseEnter: () => void
  /** Mouse leave handler for hover detection */
  onMouseLeave: () => void
}

/**
 * Shared edge path rendering component
 * Renders both the visible BaseEdge and the invisible hover detection path
 */
export function EdgePath(props: EdgePathProps) {
  const { edgePath, markerEnd, style, selected, isEdgeHovered, data, onMouseEnter, onMouseLeave } = props

  // Determine stroke color and style based on execution status
  const { strokeColor, strokeOpacity, strokeDasharray } = useMemo(() => {
    // Execution status takes precedence over interactive states
    if (data?.executionStatus === 'passed') {
      return {
        strokeColor: '#6b7280', // Gray (matches automation builder default)
        strokeOpacity: 1,
        strokeDasharray: 'none', // Solid line
      }
    } else if (data?.executionStatus === 'pending') {
      return {
        strokeColor: '#9ca3af', // Dimmed gray (pending edge)
        strokeOpacity: 0.4,
        strokeDasharray: '5,5', // Dashed line
      }
    }

    // Fall back to existing interactive state styling
    const isHighlighted = selected || isEdgeHovered || data?.isActive
    return {
      strokeColor: isHighlighted ? '#e5e7eb' : '#6b7280',
      strokeOpacity: 1,
      strokeDasharray: 'none',
    }
  }, [selected, isEdgeHovered, data?.isActive, data?.executionStatus])

  const edgeStyle = {
    ...style,
    stroke: strokeColor,
    strokeOpacity,
    strokeDasharray,
    strokeWidth: 2,
    pointerEvents: 'none' as const,
    filter: selected || isEdgeHovered || data?.isActive ? 'drop-shadow(0 0 4px rgba(255, 255, 255, 0.2))' : 'none',
  }

  return (
    <>
      {/* Visible edge - render path directly for pending edges to use custom marker */}
      {data?.isPending && typeof markerEnd === 'string' ? (
        <g>
          <defs>
            <marker
              id="pending-arrow-marker"
              markerWidth="12"
              markerHeight="12"
              viewBox="-10 -10 20 20"
              orient="auto"
              refX="-5"
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
          <path
            d={edgePath}
            fill="none"
            stroke={strokeColor}
            strokeWidth={2}
            markerEnd="url(#pending-arrow-marker)"
            style={edgeStyle}
          />
        </g>
      ) : (
        <BaseEdge path={edgePath} markerEnd={markerEnd as EdgeProps['markerEnd']} style={edgeStyle} />
      )}
      {/* Invisible wider path for hover detection */}
      {!data?.isPending && (
        <path
          d={edgePath}
          fill="none"
          stroke="transparent"
          strokeWidth={20}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          style={{ pointerEvents: 'stroke' }}
        />
      )}
    </>
  )
}
