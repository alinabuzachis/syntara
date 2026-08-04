import { EdgeHandleEnum } from '@syntara/contracts'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Position } from '@xyflow/react'
import type React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { ButtonEdge } from './ButtonEdge'
import { BUTTON_EDGE_DEFAULT_STROKE, getButtonEdgeStrokeColor } from './buttonEdgeStrokeColor'
import { calculateStubTarget } from './edgeUtils'

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

vi.mock('./edgeUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./edgeUtils')>()
  return {
    ...actual,
    adjustSourceCoordinates: (x: number, y: number) => ({ x, y }),
  }
})

const mockSetPendingDragHandle = vi.fn()
vi.mock('../utils/pendingDragHandle', () => ({
  setPendingDragHandle: (...args: unknown[]) => {
    mockSetPendingDragHandle(...args)
  },
}))

describe('calculateStubTarget', () => {
  const stubLength = 50

  it('returns correct target for Position.Right (x + stubLength)', () => {
    const result = calculateStubTarget(100, 50, Position.Right, stubLength)
    expect(result).toEqual({ targetX: 150, targetY: 50 })
  })

  it('returns correct target for Position.Left (x - stubLength)', () => {
    const result = calculateStubTarget(100, 50, Position.Left, stubLength)
    expect(result).toEqual({ targetX: 50, targetY: 50 })
  })

  it('returns correct target for Position.Bottom (y + stubLength)', () => {
    const result = calculateStubTarget(100, 50, Position.Bottom, stubLength)
    expect(result).toEqual({ targetX: 100, targetY: 100 })
  })

  it('returns correct target for Position.Top (y - stubLength)', () => {
    const result = calculateStubTarget(100, 50, Position.Top, stubLength)
    expect(result).toEqual({ targetX: 100, targetY: 0 })
  })

  it('defaults to right for unknown position', () => {
    const result = calculateStubTarget(100, 50, 'unknown' as Position, stubLength)
    expect(result).toEqual({ targetX: 150, targetY: 50 })
  })
})

describe('getButtonEdgeStrokeColor', () => {
  it('returns success token for approved handle', () => {
    expect(getButtonEdgeStrokeColor(EdgeHandleEnum.APPROVED)).toBe(
      'var(--pf-t--global--color--status--success--default)'
    )
  })

  it('returns danger token for rejected handle', () => {
    expect(getButtonEdgeStrokeColor(EdgeHandleEnum.REJECTED)).toBe(
      'var(--pf-t--global--color--status--danger--default)'
    )
  })

  it('returns default gray for other or missing handles', () => {
    expect(getButtonEdgeStrokeColor(undefined)).toBe(BUTTON_EDGE_DEFAULT_STROKE)
    expect(getButtonEdgeStrokeColor(null)).toBe(BUTTON_EDGE_DEFAULT_STROKE)
    expect(getButtonEdgeStrokeColor('source')).toBe(BUTTON_EDGE_DEFAULT_STROKE)
  })
})

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

  it('uses approval stroke color when sourceHandleId is approved', () => {
    render(<ButtonEdge {...defaultProps} sourceHandleId={EdgeHandleEnum.APPROVED} />)

    const visibleStrokePath = screen.getByTestId('button-edge-stroke')
    expect(visibleStrokePath).toHaveAttribute('stroke', 'var(--pf-t--global--color--status--success--default)')
  })

  it('uses rejected stroke color when sourceHandleId is rejected', () => {
    render(<ButtonEdge {...defaultProps} sourceHandleId={EdgeHandleEnum.REJECTED} />)

    const visibleStrokePath = screen.getByTestId('button-edge-stroke')
    expect(visibleStrokePath).toHaveAttribute('stroke', 'var(--pf-t--global--color--status--danger--default)')
  })

  it('falls back to data.sourceHandle when sourceHandleId is undefined', () => {
    render(
      <ButtonEdge
        {...defaultProps}
        sourceHandleId={undefined}
        data={{ ...defaultProps.data, sourceHandle: EdgeHandleEnum.APPROVED }}
      />
    )

    const visibleStrokePath = screen.getByTestId('button-edge-stroke')
    expect(visibleStrokePath).toHaveAttribute('stroke', 'var(--pf-t--global--color--status--success--default)')
  })

  it('renders plus icon', () => {
    render(<ButtonEdge {...defaultProps} />)
    expect(screen.getByTestId('edge-label-renderer')).toBeInTheDocument()
  })

  it('renders clickable area', () => {
    render(<ButtonEdge {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Add connected step' })).toBeInTheDocument()
  })

  it('calls onButtonClick when clicked', async () => {
    const user = userEvent.setup()
    render(<ButtonEdge {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: 'Add connected step' }))
    expect(defaultProps.data.onButtonClick).toHaveBeenCalled()
  })

  it('calculates target position for right source position', () => {
    render(<ButtonEdge {...defaultProps} />)
    const baseEdge = screen.getByTestId('base-edge')
    // Path should extend to the right, stopping at the left border of the "+" square
    expect(baseEdge.getAttribute('d')).toContain('L 138')
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

  it('handles missing data gracefully', async () => {
    const user = userEvent.setup()
    render(<ButtonEdge {...defaultProps} data={undefined} />)

    expect(screen.getByTestId('base-edge')).toBeInTheDocument()
    const addButton = screen.getByRole('button', { name: 'Add connected step' })
    await user.click(addButton)
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
      // eslint-disable-next-line testing-library/prefer-user-event -- cleans up the global mouseup listener attached by ButtonEdge's drag-start handler; must target document, not a rendered element
      fireEvent.mouseUp(document)

      // eslint-disable-next-line testing-library/no-node-access -- removes a manually appended mock DOM element used to simulate React Flow's handle; not querying rendered component structure
      if (mockHandleElement?.parentNode) {
        mockHandleElement.parentNode.removeChild(mockHandleElement)
      }
    })

    it('does nothing when source node is not found', () => {
      mockGetNode.mockReturnValue(null)

      render(<ButtonEdge {...defaultProps} />)

      const addButton = screen.getByRole('button', { name: 'Add connected step' })
      // eslint-disable-next-line testing-library/prefer-user-event -- ButtonEdge uses onMouseDown (not onClick) to initiate React Flow drag; userEvent triggers the full pointer sequence which interferes with the drag-start handler
      fireEvent.mouseDown(addButton)

      expect(mockSetPendingDragHandle).not.toHaveBeenCalled()
    })

    it('does nothing when handle element is not found', () => {
      mockGetNode.mockReturnValue({ id: 'node-1', position: { x: 50, y: 25 } })
      // Remove the mock handle element
      document.body.removeChild(mockHandleElement)

      render(<ButtonEdge {...defaultProps} />)

      const addButton = screen.getByRole('button', { name: 'Add connected step' })
      // eslint-disable-next-line testing-library/prefer-user-event -- ButtonEdge uses onMouseDown (not onClick) to initiate React Flow drag; userEvent triggers the full pointer sequence which interferes with the drag-start handler
      fireEvent.mouseDown(addButton)

      expect(mockSetPendingDragHandle).not.toHaveBeenCalled()

      // Re-add for cleanup in afterEach
      document.body.appendChild(mockHandleElement)
    })

    it('initiates drag when source node and handle element exist', () => {
      mockGetNode.mockReturnValue({ id: 'node-1', position: { x: 50, y: 25 } })
      mockGetEdge.mockReturnValue({ id: 'button-edge-1', sourceHandle: 'source' })
      mockFlowToScreenPosition.mockReturnValue({ x: 500, y: 300 })

      render(<ButtonEdge {...defaultProps} />)

      const addButton = screen.getByRole('button', { name: 'Add connected step' })
      // eslint-disable-next-line testing-library/prefer-user-event -- ButtonEdge uses onMouseDown (not onClick) to initiate React Flow drag; userEvent triggers the full pointer sequence which interferes with the drag-start handler
      fireEvent.mouseDown(addButton)

      expect(mockSetPendingDragHandle).toHaveBeenCalledWith('node-1', 'source')
      expect(dispatchEventSpy).toHaveBeenCalled()
    })

    it('uses default handle ID when edge has no sourceHandle', () => {
      mockGetNode.mockReturnValue({ id: 'node-1', position: { x: 50, y: 25 } })
      mockGetEdge.mockReturnValue({ id: 'button-edge-1', sourceHandle: null })
      mockFlowToScreenPosition.mockReturnValue({ x: 500, y: 300 })

      render(<ButtonEdge {...defaultProps} />)

      const addButton = screen.getByRole('button', { name: 'Add connected step' })
      // eslint-disable-next-line testing-library/prefer-user-event -- ButtonEdge uses onMouseDown (not onClick) to initiate React Flow drag; userEvent triggers the full pointer sequence which interferes with the drag-start handler
      fireEvent.mouseDown(addButton)

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

      render(<ButtonEdge {...defaultProps} />)

      const addButton = screen.getByRole('button', { name: 'Add connected step' })
      // eslint-disable-next-line testing-library/prefer-user-event -- ButtonEdge uses onMouseDown (not onClick) to initiate React Flow drag; userEvent triggers the full pointer sequence which interferes with the drag-start handler
      fireEvent.mouseDown(addButton)

      expect(mockSetPendingDragHandle).toHaveBeenCalledWith('node-1', 'true')

      document.body.removeChild(trueHandleElement)
    })

    it('sets dragging state and resets on mouseup', () => {
      mockGetNode.mockReturnValue({ id: 'node-1', position: { x: 50, y: 25 } })
      mockGetEdge.mockReturnValue({ id: 'button-edge-1', sourceHandle: 'source' })
      mockFlowToScreenPosition.mockReturnValue({ x: 500, y: 300 })

      render(<ButtonEdge {...defaultProps} />)

      const addButton = screen.getByRole('button', { name: 'Add connected step' })

      // eslint-disable-next-line testing-library/prefer-user-event -- ButtonEdge uses onMouseDown (not onClick) to initiate React Flow drag; userEvent triggers the full pointer sequence which interferes with the drag-start handler
      fireEvent.mouseDown(addButton)
      // eslint-disable-next-line testing-library/prefer-user-event
      fireEvent.mouseUp(document)

      // The dragging state should have been reset
      // We can verify by clicking - if not dragging, onButtonClick should be called
      // eslint-disable-next-line testing-library/prefer-user-event
      fireEvent.click(addButton)
      expect(defaultProps.data.onButtonClick).toHaveBeenCalled()
    })

    it('does not call onButtonClick while dragging', () => {
      mockGetNode.mockReturnValue({ id: 'node-1', position: { x: 50, y: 25 } })
      mockGetEdge.mockReturnValue({ id: 'button-edge-1', sourceHandle: 'source' })
      mockFlowToScreenPosition.mockReturnValue({ x: 500, y: 300 })

      const onButtonClick = vi.fn()
      render(<ButtonEdge {...defaultProps} data={{ ...defaultProps.data, onButtonClick }} />)

      const addButton = screen.getByRole('button', { name: 'Add connected step' })

      // eslint-disable-next-line testing-library/prefer-user-event -- ButtonEdge uses onMouseDown (not onClick) to initiate React Flow drag; userEvent triggers the full pointer sequence which interferes with the drag-start handler
      fireEvent.mouseDown(addButton)
      // eslint-disable-next-line testing-library/prefer-user-event
      fireEvent.click(addButton)
      expect(onButtonClick).not.toHaveBeenCalled()

      // eslint-disable-next-line testing-library/prefer-user-event
      fireEvent.mouseUp(document)

      // eslint-disable-next-line testing-library/prefer-user-event
      fireEvent.click(addButton)
      expect(onButtonClick).toHaveBeenCalled()
    })
  })
})
