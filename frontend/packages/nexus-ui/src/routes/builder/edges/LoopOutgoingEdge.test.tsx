import { render, screen } from '@testing-library/react'
import { Position } from '@xyflow/react'
import type React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { LoopOutgoingEdge } from './LoopOutgoingEdge'

// Mock @xyflow/react
vi.mock('@xyflow/react', () => ({
  getSmoothStepPath: () => ['M0 0 L50 0 L50 100 L100 100', 50, 50],
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
  adjustEdgeCoordinates: (sX: number, sY: number, _sP: unknown, tX: number, tY: number) => ({
    sourceX: sX,
    sourceY: sY,
    targetX: tX,
    targetY: tY,
  }),
}))

describe('LoopOutgoingEdge', () => {
  const defaultProps = {
    id: 'edge-1',
    source: 'loop-node',
    target: 'body-node',
    sourceX: 100,
    sourceY: 50,
    targetX: 200,
    targetY: 150,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  }

  it('renders EdgePath', () => {
    render(<LoopOutgoingEdge {...defaultProps} />)
    expect(screen.getByTestId('edge-path')).toBeInTheDocument()
  })

  it('does not render EdgeLabel when no label', () => {
    render(<LoopOutgoingEdge {...defaultProps} />)
    expect(screen.queryByTestId('edge-label')).not.toBeInTheDocument()
  })

  it('renders EdgeLabel when label is provided', () => {
    render(<LoopOutgoingEdge {...defaultProps} label="Loop" />)
    expect(screen.getByTestId('edge-label')).toBeInTheDocument()
  })

  it('does not show EdgeActions when not hovered', () => {
    render(<LoopOutgoingEdge {...defaultProps} />)
    expect(screen.queryByTestId('edge-actions')).not.toBeInTheDocument()
  })
})
