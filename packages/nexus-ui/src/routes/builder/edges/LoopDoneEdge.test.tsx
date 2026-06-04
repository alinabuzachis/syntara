import { render, screen } from '@testing-library/react'
import { Position } from '@xyflow/react'
import type React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { LoopDoneEdge } from './LoopDoneEdge'

const mockNodesConnectable = vi.hoisted(() => ({ value: true }))
const mockIsHovered = vi.hoisted(() => ({ value: false }))

// Mock @xyflow/react
vi.mock('@xyflow/react', () => ({
  getBezierPath: () => ['M0 0 L100 100', 50, 50],
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useStore: (selector: (s: { nodesConnectable: boolean }) => boolean) =>
    selector({ nodesConnectable: mockNodesConnectable.value }),
  Position: {
    Top: 'top',
    Bottom: 'bottom',
    Left: 'left',
    Right: 'right',
  },
}))

// Mock sub-components
vi.mock('./EdgePath', () => ({
  EdgePath: ({ edgePath, markerEnd }: { edgePath: string; markerEnd?: string }) => (
    <path data-testid="edge-path" d={edgePath} markerEnd={markerEnd} />
  ),
}))

vi.mock('./EdgeLabel', () => ({
  EdgeLabel: ({ label }: { label?: React.ReactNode }) => (label ? <span data-testid="edge-label">{label}</span> : null),
}))

vi.mock('./EdgeActions', () => ({
  EdgeActions: () => <div data-testid="edge-actions" />,
}))

vi.mock('./useEdgeHandlers', () => ({
  useEdgeHandlers: () => ({
    isHovered: mockIsHovered.value,
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
  adjustEdgeCoordinates: (sX: number, sY: number, _sP: unknown, tX: number, tY: number) => ({
    sourceX: sX,
    sourceY: sY,
    targetX: tX,
    targetY: tY,
  }),
}))

describe('LoopDoneEdge', () => {
  const defaultProps = {
    id: 'edge-1',
    source: 'loop-node',
    target: 'next-node',
    sourceX: 100,
    sourceY: 50,
    targetX: 200,
    targetY: 150,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  }

  it('renders EdgePath', () => {
    render(<LoopDoneEdge {...defaultProps} />)
    expect(screen.getByTestId('edge-path')).toBeInTheDocument()
  })

  it('does not render EdgeLabel when no label', () => {
    render(<LoopDoneEdge {...defaultProps} />)
    expect(screen.queryByTestId('edge-label')).not.toBeInTheDocument()
  })

  it('renders EdgeLabel when label is provided', () => {
    render(<LoopDoneEdge {...defaultProps} label="Done" />)
    expect(screen.getByTestId('edge-label')).toBeInTheDocument()
  })

  it('does not show EdgeActions when not hovered', () => {
    render(<LoopDoneEdge {...defaultProps} />)
    expect(screen.queryByTestId('edge-actions')).not.toBeInTheDocument()
  })

  it('shows EdgeActions when data.isActive is true', () => {
    render(<LoopDoneEdge {...defaultProps} data={{ isActive: true }} />)
    expect(screen.getByTestId('edge-actions')).toBeInTheDocument()
  })

  it('shows EdgeActions when hovered', () => {
    mockIsHovered.value = true
    render(<LoopDoneEdge {...defaultProps} />)
    expect(screen.getByTestId('edge-actions')).toBeInTheDocument()
    mockIsHovered.value = false
  })

  it('hides EdgeActions when hovered but isPending', () => {
    mockIsHovered.value = true
    render(<LoopDoneEdge {...defaultProps} data={{ isPending: true }} />)
    expect(screen.queryByTestId('edge-actions')).not.toBeInTheDocument()
    mockIsHovered.value = false
  })

  it('hides EdgeActions when hovered but has executionStatus', () => {
    mockIsHovered.value = true
    render(<LoopDoneEdge {...defaultProps} data={{ executionStatus: 'pending' }} />)
    expect(screen.queryByTestId('edge-actions')).not.toBeInTheDocument()
    mockIsHovered.value = false
  })

  it('hides EdgeActions when isPending is true', () => {
    render(<LoopDoneEdge {...defaultProps} data={{ isActive: true, isPending: true }} />)
    expect(screen.queryByTestId('edge-actions')).not.toBeInTheDocument()
  })

  it('hides EdgeActions when executionStatus is set', () => {
    render(<LoopDoneEdge {...defaultProps} data={{ isActive: true, executionStatus: 'passed' }} />)
    expect(screen.queryByTestId('edge-actions')).not.toBeInTheDocument()
  })

  it('hides edge actions when nodesConnectable is false', () => {
    mockNodesConnectable.value = false
    render(<LoopDoneEdge {...defaultProps} data={{ isActive: true }} />)
    expect(screen.queryByTestId('edge-actions')).not.toBeInTheDocument()
    mockNodesConnectable.value = true
  })
})
