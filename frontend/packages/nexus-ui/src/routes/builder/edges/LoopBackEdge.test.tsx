import { render, screen } from '@testing-library/react'
import { Position } from '@xyflow/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LoopBackEdge } from './LoopBackEdge'

// Mock @xyflow/react
const mockGetNodes = vi.fn()
vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>()
  return {
    ...actual,
    useReactFlow: () => ({
      getNodes: mockGetNodes,
    }),
  }
})

// Mock sub-components
vi.mock('./EdgePath', () => ({
  EdgePath: ({ edgePath }: { edgePath: string }) => <path data-testid="edge-path" d={edgePath} />,
}))

vi.mock('./EdgeLabel', () => ({
  EdgeLabel: ({ label }: { label?: React.ReactNode }) => (label ? <span data-testid="edge-label">{label}</span> : null),
}))

vi.mock('./EdgeActions', () => ({
  EdgeActions: () => <div data-testid="edge-actions" />,
}))

vi.mock('./useEdgeHandlers', () => ({
  useEdgeHandlers: () => ({
    isHovered: false,
    isEdgeHovered: false,
    effectiveMarkerEnd: 'url(#arrow)',
    handleEdgeMouseEnter: vi.fn(),
    handleEdgeMouseLeave: vi.fn(),
    handleButtonMouseEnter: vi.fn(),
    handleButtonMouseLeave: vi.fn(),
    handleDelete: vi.fn(),
    handleAddNode: vi.fn(),
  }),
}))

vi.mock('./edgeUtils', () => ({
  adjustSourceCoordinates: (x: number, y: number) => ({ x, y }),
}))

describe('LoopBackEdge', () => {
  const defaultProps = {
    id: 'edge-1',
    source: 'body-node',
    target: 'loop-node',
    sourceX: 300,
    sourceY: 150,
    targetX: 100,
    targetY: 50,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  }

  beforeEach(() => {
    mockGetNodes.mockReturnValue([
      { id: 'loop-node', position: { x: 50, y: 25 }, measured: { height: 50 } },
      { id: 'body-node', position: { x: 250, y: 125 }, measured: { height: 50 } },
    ])
  })

  it('renders EdgePath', () => {
    render(<LoopBackEdge {...defaultProps} />)
    expect(screen.getByTestId('edge-path')).toBeInTheDocument()
  })

  it('does not render EdgeLabel when no label', () => {
    render(<LoopBackEdge {...defaultProps} />)
    expect(screen.queryByTestId('edge-label')).not.toBeInTheDocument()
  })

  it('renders EdgeLabel when label is provided', () => {
    render(<LoopBackEdge {...defaultProps} label="Back" />)
    expect(screen.getByTestId('edge-label')).toBeInTheDocument()
  })

  it('does not show EdgeActions when not hovered', () => {
    render(<LoopBackEdge {...defaultProps} />)
    expect(screen.queryByTestId('edge-actions')).not.toBeInTheDocument()
  })

  it('calculates path around loop body nodes', () => {
    // Add an intermediate node
    mockGetNodes.mockReturnValue([
      { id: 'loop-node', position: { x: 50, y: 25 }, measured: { height: 50 } },
      { id: 'body-node', position: { x: 250, y: 125 }, measured: { height: 50 } },
      { id: 'middle-node', position: { x: 150, y: 25 }, measured: { height: 100 } },
    ])

    render(<LoopBackEdge {...defaultProps} />)
    expect(screen.getByTestId('edge-path')).toBeInTheDocument()
  })

  it('handles nodes without measured dimensions', () => {
    mockGetNodes.mockReturnValue([
      { id: 'loop-node', position: { x: 50, y: 25 } },
      { id: 'body-node', position: { x: 250, y: 125 } },
    ])

    render(<LoopBackEdge {...defaultProps} />)
    expect(screen.getByTestId('edge-path')).toBeInTheDocument()
  })
})
