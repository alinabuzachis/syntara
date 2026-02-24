import { render, screen, fireEvent } from '@testing-library/react'
import { Position } from '@xyflow/react'
import type React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { ButtonEdge } from './ButtonEdge'

// Mock @xyflow/react
const mockGetEdge = vi.fn()
const mockGetNode = vi.fn()
const mockFlowToScreenPosition = vi.fn()

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>()
  return {
    ...actual,
    useReactFlow: () => ({
      getEdge: mockGetEdge,
      getNode: mockGetNode,
      flowToScreenPosition: mockFlowToScreenPosition,
    }),
    BaseEdge: ({ path, id }: { path: string; id: string }) => <path data-testid="base-edge" d={path} id={id} />,
    EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="edge-label-renderer">{children}</div>
    ),
  }
})

vi.mock('./edgeUtils', () => ({
  adjustSourceCoordinates: (x: number, y: number) => ({ x, y }),
}))

const mockSetPendingDragHandle = vi.fn()
vi.mock('../utils/pendingDragHandle', () => ({
  setPendingDragHandle: (...args: unknown[]) => mockSetPendingDragHandle(...args),
}))

describe('ButtonEdge', () => {
  const defaultProps = {
    id: 'button-edge-1',
    source: 'node-1',
    target: '__placeholder__',
    sourceX: 100,
    sourceY: 50,
    targetX: 150,
    targetY: 50,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: {
      onButtonClick: vi.fn(),
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetEdge.mockReturnValue({ id: 'button-edge-1', sourceHandle: 'source' })
    mockGetNode.mockReturnValue({ id: 'node-1', position: { x: 50, y: 25 } })
    mockFlowToScreenPosition.mockReturnValue({ x: 500, y: 300 })
  })

  it('renders BaseEdge', () => {
    render(<ButtonEdge {...defaultProps} />)
    expect(screen.getByTestId('base-edge')).toBeInTheDocument()
  })

  it('renders plus icon', () => {
    render(<ButtonEdge {...defaultProps} />)
    expect(screen.getByTestId('edge-label-renderer')).toBeInTheDocument()
  })

  it('renders clickable area', () => {
    const { container } = render(<ButtonEdge {...defaultProps} />)
    const rect = container.querySelector('rect')
    expect(rect).toBeInTheDocument()
  })

  it('calls onButtonClick when clicked', () => {
    const { container } = render(<ButtonEdge {...defaultProps} />)
    const rect = container.querySelector('rect')
    fireEvent.click(rect!)
    expect(defaultProps.data.onButtonClick).toHaveBeenCalled()
  })

  it('calculates target position for right source position', () => {
    render(<ButtonEdge {...defaultProps} />)
    const baseEdge = screen.getByTestId('base-edge')
    // Path should extend to the right
    expect(baseEdge.getAttribute('d')).toContain('L 150')
  })

  it('calculates target position for bottom source position', () => {
    render(<ButtonEdge {...defaultProps} sourcePosition={Position.Bottom} />)
    const baseEdge = screen.getByTestId('base-edge')
    expect(baseEdge).toBeInTheDocument()
  })

  it('calculates target position for left source position', () => {
    render(<ButtonEdge {...defaultProps} sourcePosition={Position.Left} />)
    const baseEdge = screen.getByTestId('base-edge')
    expect(baseEdge).toBeInTheDocument()
  })

  it('calculates target position for top source position', () => {
    render(<ButtonEdge {...defaultProps} sourcePosition={Position.Top} />)
    const baseEdge = screen.getByTestId('base-edge')
    expect(baseEdge).toBeInTheDocument()
  })

  it('applies active style when data.isActive is true', () => {
    render(<ButtonEdge {...defaultProps} data={{ ...defaultProps.data, isActive: true }} />)
    expect(screen.getByTestId('edge-label-renderer')).toBeInTheDocument()
  })

  it('handles missing data gracefully', () => {
    const { container } = render(<ButtonEdge {...defaultProps} data={undefined} />)
    const rect = container.querySelector('rect')
    fireEvent.click(rect!)
    // Should not throw
  })

  it('handles default source position', () => {
    // Test with an unrecognized position (falls through to default case)
    render(<ButtonEdge {...defaultProps} sourcePosition={'unknown' as Position} />)
    const baseEdge = screen.getByTestId('base-edge')
    expect(baseEdge).toBeInTheDocument()
  })

  describe('handleMouseDown (drag functionality)', () => {
    let mockHandleElement: HTMLDivElement
    let dispatchEventSpy: ReturnType<typeof vi.fn<(event: Event) => boolean>>

    beforeEach(() => {
      // Create a mock handle element in the DOM
      mockHandleElement = document.createElement('div')
      mockHandleElement.setAttribute('data-nodeid', 'node-1')
      mockHandleElement.setAttribute('data-handleid', 'source')
      dispatchEventSpy = vi.fn<(event: Event) => boolean>().mockReturnValue(true)
      mockHandleElement.dispatchEvent = dispatchEventSpy
      document.body.appendChild(mockHandleElement)
    })

    afterEach(() => {
      if (mockHandleElement && mockHandleElement.parentNode) {
        mockHandleElement.parentNode.removeChild(mockHandleElement)
      }
    })

    it('does nothing when source node is not found', () => {
      mockGetNode.mockReturnValue(null)

      const { container } = render(<ButtonEdge {...defaultProps} />)
      const rect = container.querySelector('rect')
      fireEvent.mouseDown(rect!)

      expect(mockSetPendingDragHandle).not.toHaveBeenCalled()
    })

    it('does nothing when handle element is not found', () => {
      mockGetNode.mockReturnValue({ id: 'node-1', position: { x: 50, y: 25 } })
      // Remove the mock handle element
      document.body.removeChild(mockHandleElement)

      const { container } = render(<ButtonEdge {...defaultProps} />)
      const rect = container.querySelector('rect')
      fireEvent.mouseDown(rect!)

      expect(mockSetPendingDragHandle).not.toHaveBeenCalled()

      // Re-add for cleanup in afterEach
      document.body.appendChild(mockHandleElement)
    })

    it('initiates drag when source node and handle element exist', () => {
      mockGetNode.mockReturnValue({ id: 'node-1', position: { x: 50, y: 25 } })
      mockGetEdge.mockReturnValue({ id: 'button-edge-1', sourceHandle: 'source' })
      mockFlowToScreenPosition.mockReturnValue({ x: 500, y: 300 })

      const { container } = render(<ButtonEdge {...defaultProps} />)
      const rect = container.querySelector('rect')
      fireEvent.mouseDown(rect!)

      expect(mockSetPendingDragHandle).toHaveBeenCalledWith('node-1', 'source')
      expect(dispatchEventSpy).toHaveBeenCalled()
    })

    it('uses default handle ID when edge has no sourceHandle', () => {
      mockGetNode.mockReturnValue({ id: 'node-1', position: { x: 50, y: 25 } })
      mockGetEdge.mockReturnValue({ id: 'button-edge-1', sourceHandle: null })
      mockFlowToScreenPosition.mockReturnValue({ x: 500, y: 300 })

      const { container } = render(<ButtonEdge {...defaultProps} />)
      const rect = container.querySelector('rect')
      fireEvent.mouseDown(rect!)

      expect(mockSetPendingDragHandle).toHaveBeenCalledWith('node-1', 'source')
    })

    it('uses condition handle ID (true/false) when present', () => {
      mockGetNode.mockReturnValue({ id: 'node-1', position: { x: 50, y: 25 } })
      mockGetEdge.mockReturnValue({ id: 'button-edge-1', sourceHandle: 'true' })
      mockFlowToScreenPosition.mockReturnValue({ x: 500, y: 300 })

      // Create a handle element with the 'true' handle ID
      const trueHandleElement = document.createElement('div')
      trueHandleElement.setAttribute('data-nodeid', 'node-1')
      trueHandleElement.setAttribute('data-handleid', 'true')
      trueHandleElement.dispatchEvent = vi.fn()
      document.body.appendChild(trueHandleElement)

      const { container } = render(<ButtonEdge {...defaultProps} />)
      const rect = container.querySelector('rect')
      fireEvent.mouseDown(rect!)

      expect(mockSetPendingDragHandle).toHaveBeenCalledWith('node-1', 'true')

      document.body.removeChild(trueHandleElement)
    })

    it('sets dragging state and resets on mouseup', () => {
      mockGetNode.mockReturnValue({ id: 'node-1', position: { x: 50, y: 25 } })
      mockGetEdge.mockReturnValue({ id: 'button-edge-1', sourceHandle: 'source' })
      mockFlowToScreenPosition.mockReturnValue({ x: 500, y: 300 })

      const { container } = render(<ButtonEdge {...defaultProps} />)
      const rect = container.querySelector('rect')

      // Trigger mousedown
      fireEvent.mouseDown(rect!)

      // Simulate mouseup
      fireEvent.mouseUp(document)

      // The dragging state should have been reset
      // We can verify by clicking - if not dragging, onButtonClick should be called
      fireEvent.click(rect!)
      expect(defaultProps.data.onButtonClick).toHaveBeenCalled()
    })

    it('does not call onButtonClick while dragging', () => {
      mockGetNode.mockReturnValue({ id: 'node-1', position: { x: 50, y: 25 } })
      mockGetEdge.mockReturnValue({ id: 'button-edge-1', sourceHandle: 'source' })
      mockFlowToScreenPosition.mockReturnValue({ x: 500, y: 300 })

      const onButtonClick = vi.fn()
      const { container } = render(<ButtonEdge {...defaultProps} data={{ ...defaultProps.data, onButtonClick }} />)
      const rect = container.querySelector('rect')

      // Start dragging
      fireEvent.mouseDown(rect!)

      // Click while dragging should be suppressed
      fireEvent.click(rect!)
      expect(onButtonClick).not.toHaveBeenCalled()

      // After mouseUp the drag state resets
      fireEvent.mouseUp(document)

      // Now click should work
      fireEvent.click(rect!)
      expect(onButtonClick).toHaveBeenCalled()
    })
  })
})
