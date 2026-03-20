import { Icon } from '@patternfly/react-core'
import { RhUiAddSquareIcon } from '@patternfly/react-icons'
import { BaseEdge, EdgeLabelRenderer, useReactFlow } from '@xyflow/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { setPendingDragHandle } from '../utils/pendingDragHandle'

import { BUTTON_EDGE_DEFAULT_STROKE, getButtonEdgeStrokeColor } from './buttonEdgeStrokeColor'
import { adjustSourceCoordinates, calculateStubTarget } from './edgeUtils'
import type { ButtonEdgeProps } from './types'

const STUB_LENGTH = 50

function useButtonEdgeDragHandler(params: { id: string; source: string; sourceX: number; sourceY: number }) {
  const reactFlowInstance = useReactFlow()
  const [isDragging, setIsDragging] = useState(false)
  const mouseUpHandlerRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => {
      if (mouseUpHandlerRef.current) {
        document.removeEventListener('mouseup', mouseUpHandlerRef.current)
      }
    }
  }, [])

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      const sourceNode = reactFlowInstance.getNode(params.source)
      if (!sourceNode) return

      const fullEdge = reactFlowInstance.getEdge(params.id)
      const handleId = fullEdge?.sourceHandle || 'source'
      const handleElement = document.querySelector(`[data-nodeid="${params.source}"][data-handleid="${handleId}"]`)
      if (!handleElement) return

      setPendingDragHandle(params.source, handleId)
      const screenPosition = reactFlowInstance.flowToScreenPosition({
        x: params.sourceX,
        y: params.sourceY,
      })
      const syntheticEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        clientX: screenPosition.x,
        clientY: screenPosition.y,
        button: 0,
      })

      setIsDragging(true)
      handleElement.dispatchEvent(syntheticEvent)

      const handleMouseUp = () => {
        setIsDragging(false)
        mouseUpHandlerRef.current = null
        document.removeEventListener('mouseup', handleMouseUp)
      }
      mouseUpHandlerRef.current = handleMouseUp
      document.addEventListener('mouseup', handleMouseUp)

      event.preventDefault()
      event.stopPropagation()
    },
    [params.id, params.source, params.sourceX, params.sourceY, reactFlowInstance]
  )

  return { handleMouseDown, isDragging }
}

/**
 * Edge with a plus button that opens the add node panel
 * Used for adding new nodes connected to existing nodes
 * Creates a short stub edge extending from the source node
 */
export function ButtonEdge(props: ButtonEdgeProps) {
  const { sourceX, sourceY, sourcePosition, style, data, id, source, sourceHandleId } = props
  const [isFocused, setIsFocused] = useState(false)
  const { handleMouseDown, isDragging } = useButtonEdgeDragHandler({ id, source, sourceX, sourceY })

  const strokeColor = getButtonEdgeStrokeColor(sourceHandleId ?? data?.sourceHandle)

  const { x: adjustedSourceX, y: adjustedSourceY } = adjustSourceCoordinates(sourceX, sourceY, sourcePosition)
  const { targetX: buttonX, targetY: buttonY } = calculateStubTarget(
    adjustedSourceX,
    adjustedSourceY,
    sourcePosition,
    STUB_LENGTH
  )
  const edgePath = `M ${adjustedSourceX},${adjustedSourceY} L ${buttonX},${buttonY}`

  const handleClick = (event: React.SyntheticEvent) => {
    event.stopPropagation()
    if (!isDragging) {
      data?.onButtonClick?.({ x: buttonX, y: buttonY })
    }
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
          stroke: BUTTON_EDGE_DEFAULT_STROKE,
          strokeWidth: 20,
          opacity: 0.01,
        }}
      />
      {/* Visible thin stroke - override CSS opacity when dragging; colored for approval handles */}
      <path d={edgePath} fill="none" stroke={strokeColor} strokeWidth={2} pointerEvents="none" style={draggingStyle} />
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
