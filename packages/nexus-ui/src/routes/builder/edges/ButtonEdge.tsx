import { BaseEdge, type EdgeProps, Position, useReactFlow } from '@xyflow/react'
import { useState } from 'react'

interface ButtonEdgeProps extends EdgeProps {
  data?: {
    onButtonClick?: () => void
    isActive?: boolean
  }
}

/**
 * Edge with a plus button that opens the add node panel
 * Used for adding new nodes connected to existing nodes
 * Creates a short stub edge extending from the source node
 */
export function ButtonEdge(props: ButtonEdgeProps) {
  const { sourceX, sourceY, sourcePosition, style, data, id, source } = props
  const [isDragging, setIsDragging] = useState(false)
  const reactFlowInstance = useReactFlow()

  // Create a short stub edge extending from the source node
  const stubLength = 50
  let targetX = sourceX
  let targetY = sourceY

  // Determine target position based on source position
  switch (sourcePosition) {
    case Position.Right:
      targetX = sourceX + stubLength
      break
    case Position.Left:
      targetX = sourceX - stubLength
      break
    case Position.Bottom:
      targetY = sourceY + stubLength
      break
    case Position.Top:
      targetY = sourceY - stubLength
      break
    default:
      // Default to right
      targetX = sourceX + stubLength
  }

  // Create a simple straight line path
  const edgePath = `M ${sourceX},${sourceY} L ${targetX},${targetY}`

  // Button position at the end of the stub
  const buttonX = targetX
  const buttonY = targetY

  const handleClick = (event: React.MouseEvent | React.TouchEvent) => {
    event.stopPropagation()
    if (!isDragging) {
      data?.onButtonClick?.()
    }
  }

  const handleMouseDown = (event: React.MouseEvent) => {
    // Get the source node
    const sourceNode = reactFlowInstance.getNode(source)
    if (!sourceNode) return

    // Find the source handle element on the source node
    const handleElement = document.querySelector(`[data-nodeid="${source}"][data-handleid="source"]`)
    if (!handleElement) return

    // Create a synthetic mouse event on the handle to trigger connection
    const handleRect = handleElement.getBoundingClientRect()
    const syntheticEvent = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: handleRect.left + handleRect.width / 2,
      clientY: handleRect.top + handleRect.height / 2,
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
      {/* Visible thin stroke */}
      <path d={edgePath} fill="none" stroke="#6b7280" strokeWidth={2} pointerEvents="none" />
      {/* Plus icon - visual elements (non-interactive) */}
      <g
        transform={`translate(${buttonX}, ${buttonY})`}
        pointerEvents="none"
        style={{
          filter: data?.isActive
            ? 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.8)) drop-shadow(0 0 12px rgba(255, 255, 255, 0.6))'
            : 'none',
        }}
      >
        <rect
          x={-7}
          y={-7}
          width={14}
          height={14}
          fill="none"
          stroke={data?.isActive ? '#ffffff' : '#9ca3af'}
          strokeWidth={1.5}
          rx={2}
        />
        <line x1={-4} y1={0} x2={4} y2={0} stroke={data?.isActive ? '#ffffff' : '#9ca3af'} strokeWidth={1.5} />
        <line x1={0} y1={-4} x2={0} y2={4} stroke={data?.isActive ? '#ffffff' : '#9ca3af'} strokeWidth={1.5} />
      </g>
      {/* Large clickable and draggable button area */}
      <rect
        x={buttonX - 15}
        y={buttonY - 15}
        width={30}
        height={30}
        fill="transparent"
        rx={4}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        className="hover:fill-gray-700/20"
        style={{ cursor: 'pointer', pointerEvents: 'all', zIndex: 100 }}
      />
    </>
  )
}
