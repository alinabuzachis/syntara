import { render, screen, fireEvent } from '@testing-library/react'
import type React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { EdgeActions } from './EdgeActions'

// Mock @xyflow/react
vi.mock('@xyflow/react', () => ({
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="edge-label-renderer">{children}</div>
  ),
}))

describe('EdgeActions', () => {
  const defaultProps = {
    labelX: 100,
    labelY: 50,
    onButtonMouseEnter: vi.fn(),
    onButtonMouseLeave: vi.fn(),
    onAddNode: vi.fn(),
    onDelete: vi.fn(),
  }

  it('renders inside EdgeLabelRenderer', () => {
    render(<EdgeActions {...defaultProps} />)
    expect(screen.getByTestId('edge-label-renderer')).toBeInTheDocument()
  })

  it('renders add node button', () => {
    render(<EdgeActions {...defaultProps} />)
    expect(screen.getByTitle('Add node')).toBeInTheDocument()
  })

  it('renders delete edge button', () => {
    render(<EdgeActions {...defaultProps} />)
    expect(screen.getByTitle('Delete edge')).toBeInTheDocument()
  })

  it('calls onAddNode when add button is clicked', () => {
    render(<EdgeActions {...defaultProps} />)
    fireEvent.click(screen.getByTitle('Add node'))
    expect(defaultProps.onAddNode).toHaveBeenCalledTimes(1)
  })

  it('calls onDelete when delete button is clicked', () => {
    render(<EdgeActions {...defaultProps} />)
    fireEvent.click(screen.getByTitle('Delete edge'))
    expect(defaultProps.onDelete).toHaveBeenCalledTimes(1)
  })

  it('calls onButtonMouseEnter when hovering', () => {
    render(<EdgeActions {...defaultProps} />)

    const container = screen.getByTestId('edge-label-renderer').firstChild as HTMLElement
    fireEvent.mouseEnter(container)
    expect(defaultProps.onButtonMouseEnter).toHaveBeenCalledTimes(1)
  })

  it('calls onButtonMouseLeave when leaving', () => {
    render(<EdgeActions {...defaultProps} />)

    const container = screen.getByTestId('edge-label-renderer').firstChild as HTMLElement
    fireEvent.mouseLeave(container)
    expect(defaultProps.onButtonMouseLeave).toHaveBeenCalledTimes(1)
  })
})
