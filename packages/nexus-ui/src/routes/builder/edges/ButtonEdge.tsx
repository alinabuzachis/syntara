import { Icon } from '@patternfly/react-core'
import { RhUiAddSquareIcon } from '@patternfly/react-icons'
import { BaseEdge, EdgeLabelRenderer, Position, useReactFlow } from '@xyflow/react'
import { useState } from 'react'

import { setPendingDragHandle } from '../utils/pendingDragHandle'

import { adjustSourceCoordinates } from './edgeUtils'
import type { ButtonEdgeProps } from './types'

/**
 * Edge with a plus button that opens the add node panel
 * Used for adding new nodes connected to existing nodes
 * Creates a short stub edge extending from the source node
 */
export function ButtonEdge(props: ButtonEdgeProps) {
  const { sourceX, sourceY, sourcePosition, style, data, id, source } = props
  const [isDragging, setIsDragging] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const reactFlowInstance = useReactFlow()

  // Get the full edge to access the sourceHandle (could be "source", "true", or "false" for condition nodes)
  const fullEdge = reactFlowInstance.getEdge(id)

  // Create a short stub edge extending from the source node
  const stubLength = 50

  // Adjust source coordinates to account for handle position at visual edge
  const { x: adjustedSourceX, y: adjustedSourceY } = adjustSourceCoordinates(sourceX, sourceY, sourcePosition)

  // Calculate target position based on adjusted source and direction
  let targetX = adjustedSourceX
  let targetY = adjustedSourceY
  switch (sourcePosition) {
    case Position.Right:
      targetX = adjustedSourceX + stubLength
      break
    case Position.Left:
      targetX = adjustedSourceX - stubLength
      break
    case Position.Bottom:
      targetY = adjustedSourceY + stubLength
      break
    case Position.Top:
      targetY = adjustedSourceY - stubLength
      break
    default:
      // Default to right
      targetX = adjustedSourceX + stubLength
  }

  // Create a simple straight line path starting from adjusted source position
  const edgePath = `M ${adjustedSourceX},${adjustedSourceY} L ${targetX},${targetY}`

  // Button position at the end of the stub (calculated from adjusted source)
  const buttonX = targetX
  const buttonY = targetY

  const handleClick = (event: React.SyntheticEvent) => {
    event.stopPropagation()
    if (!isDragging) {
      data?.onButtonClick?.({ x: buttonX, y: buttonY })
    }
  }

  const handleMouseDown = (event: React.MouseEvent) => {
    // Get the source node
    const sourceNode = reactFlowInstance.getNode(source)
    if (!sourceNode) return

    // Use the actual handle ID from the edge (could be "source", "true", or "false")
    const handleId = fullEdge?.sourceHandle || 'source'

    // Find the source handle element on the source node
    const handleElement = document.querySelector(`[data-nodeid="${source}"][data-handleid="${handleId}"]`)
    if (!handleElement) return

    // Set the intended handle ID BEFORE dispatching the event.
    // This allows BuilderFlow's onConnectStart to override React Flow's detection
    // which can pick the wrong handle when condition node handles have overlapping areas.
    setPendingDragHandle(source, handleId)

    // Convert the flow coordinates (sourceX, sourceY) to screen coordinates
    // This gives us the exact position of this specific handle, avoiding issues with
    // overlapping handle hit areas on condition nodes
    const screenPosition = reactFlowInstance.flowToScreenPosition({ x: sourceX, y: sourceY })

    // Create a synthetic mouse event on the handle to trigger connection
    const syntheticEvent = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: screenPosition.x,
      clientY: screenPosition.y,
      button: 0,
    })

    setIsDragging(true)
    handleElement.dispatchEvent(syntheticEvent)

    // Track drag state
    const handleMouseUp = () => {
      setIsDragging(false)
      document.removeEventListener('mouseup', handleMouseUp)
    }
    document.addEventListener('mouseup', handleMouseUp)

    event.preventDefault()
    event.stopPropagation()
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleClick(event)
    }
  }

  // When dragging, use inline styles to override CSS that hides button edges during connection
  const draggingStyle = isDragging ? { opacity: 1 } : undefined

  return (
    <>
      {/* Main edge - wide for easy hit detection */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          stroke: '#6b7280',
          strokeWidth: 20,
          opacity: 0.01,
        }}
      />
      {/* Visible thin stroke - override CSS opacity when dragging */}
      <path d={edgePath} fill="none" stroke="#6b7280" strokeWidth={2} pointerEvents="none" style={draggingStyle} />
      {/* Plus icon - visual elements (non-interactive) */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${buttonX}px,${buttonY}px)`,
            pointerEvents: 'none',
            filter: data?.isActive
              ? 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.8)) drop-shadow(0 0 12px rgba(255, 255, 255, 0.6))'
              : 'none',
            color: data?.isActive ? '#ffffff' : '#9ca3af',
            ...draggingStyle,
          }}
        >
          <Icon iconSize="lg">
            <RhUiAddSquareIcon />
          </Icon>
        </div>
      </EdgeLabelRenderer>
      {/* Large clickable area (draggable for all node types) */}
      <rect
        x={buttonX - 15}
        y={buttonY - 15}
        width={30}
        height={30}
        fill="transparent"
        rx={4}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        role="button"
        aria-label="Add connected node"
        tabIndex={0}
        stroke={isFocused ? '#60a5fa' : 'none'}
        strokeWidth={isFocused ? 2 : 0}
        style={{ cursor: 'pointer', pointerEvents: 'all', zIndex: 100 }}
      />
    </>
  )
}
