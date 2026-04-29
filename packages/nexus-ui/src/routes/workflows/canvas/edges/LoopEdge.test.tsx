import { render, screen } from '@testing-library/react'
import { Position } from '@xyflow/react'
import { describe, expect, it, vi } from 'vitest'

import { LoopEdge } from './LoopEdge'

// Mock @xyflow/react
vi.mock('@xyflow/react', () => ({
  BaseEdge: ({ path, markerEnd }: { path: string; markerEnd?: string }) => (
    <div data-testid="base-edge" data-path={path} data-marker-end={markerEnd} />
  ),
  Position: {
    Right: 'right',
    Left: 'left',
    Top: 'top',
    Bottom: 'bottom',
  },
}))

describe('LoopEdge', () => {
  const defaultProps = {
    id: 'edge-1',
    source: 'node-1',
    target: 'node-1',
    sourceX: 100,
    sourceY: 50,
    targetX: 50,
    targetY: 50,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    markerEnd: 'url(#arrow)',
  }

  it('renders without crashing', () => {
    const { container } = render(<LoopEdge {...defaultProps} />)
    expect(container).toBeInTheDocument()
  })

  it('renders BaseEdge with correct path', () => {
    render(<LoopEdge {...defaultProps} />)
    const edge = screen.getByTestId('base-edge')
    expect(edge).toBeInTheDocument()
    expect(edge).toHaveAttribute('data-path')
  })

  it('renders with markerEnd prop', () => {
    render(<LoopEdge {...defaultProps} />)
    const edge = screen.getByTestId('base-edge')
    // Verify markerEnd is passed to BaseEdge component
    expect(edge).toHaveAttribute('data-marker-end', 'url(#arrow)')
  })

  it('calculates path based on source and target coordinates', () => {
    render(<LoopEdge {...defaultProps} />)
    const edge = screen.getByTestId('base-edge')
    const path = edge.getAttribute('data-path')
    // Path should contain source and target coordinates
    expect(path).toContain('M 95') // sourceX - 5
    expect(path).toContain('50') // sourceY/targetY
  })
})
