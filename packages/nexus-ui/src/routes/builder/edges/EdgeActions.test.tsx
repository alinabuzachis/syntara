import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EdgeActions } from './EdgeActions'

// Mock @xyflow/react
vi.mock('@xyflow/react', () => ({
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="edge-label-renderer">{children}</div>
  ),
}))

describe('EdgeActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

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

  it('renders add step button', () => {
    render(<EdgeActions {...defaultProps} />)
    expect(screen.getByTitle('Add step')).toBeInTheDocument()
  })

  it('renders delete edge button', () => {
    render(<EdgeActions {...defaultProps} />)
    expect(screen.getByTitle('Delete edge')).toBeInTheDocument()
  })

  it('calls onAddNode when add button is clicked', async () => {
    const user = userEvent.setup()
    render(<EdgeActions {...defaultProps} />)
    await user.click(screen.getByTitle('Add step'))
    expect(defaultProps.onAddNode).toHaveBeenCalledTimes(1)
  })

  it('calls onDelete when delete button is clicked', async () => {
    const user = userEvent.setup()
    render(<EdgeActions {...defaultProps} />)
    await user.click(screen.getByTitle('Delete edge'))
    expect(defaultProps.onDelete).toHaveBeenCalledTimes(1)
  })

  it('calls onButtonMouseEnter when hovering', async () => {
    const user = userEvent.setup()
    render(<EdgeActions {...defaultProps} />)
    const toolbar = screen.getByRole('toolbar', { name: 'Edge actions' })
    await user.hover(toolbar)
    expect(defaultProps.onButtonMouseEnter).toHaveBeenCalledTimes(1)
  })

  it('calls onButtonMouseLeave when leaving', async () => {
    const user = userEvent.setup()
    render(<EdgeActions {...defaultProps} />)
    const toolbar = screen.getByRole('toolbar', { name: 'Edge actions' })
    await user.hover(toolbar)
    await user.unhover(toolbar)
    expect(defaultProps.onButtonMouseLeave).toHaveBeenCalledTimes(1)
  })
})
