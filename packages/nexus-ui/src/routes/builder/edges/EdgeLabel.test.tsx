import { render, screen } from '@testing-library/react'
import type React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { EdgeLabel } from './EdgeLabel'

// Mock @xyflow/react
vi.mock('@xyflow/react', () => ({
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="edge-label-renderer">{children}</div>
  ),
}))

describe('EdgeLabel', () => {
  it('returns null when no label is provided', () => {
    const { container } = render(<EdgeLabel labelX={100} labelY={50} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders label when provided', () => {
    render(<EdgeLabel labelX={100} labelY={50} label="Test Label" />)
    expect(screen.getByText('Test Label')).toBeInTheDocument()
  })

  it('renders inside EdgeLabelRenderer', () => {
    render(<EdgeLabel labelX={100} labelY={50} label="Test Label" />)
    expect(screen.getByTestId('edge-label-renderer')).toBeInTheDocument()
  })

  it('positions label using transform style', () => {
    render(<EdgeLabel labelX={100} labelY={50} label="Test Label" />)
    const labelDiv = screen.getByText('Test Label').closest('div')
    expect(labelDiv).toHaveStyle({
      position: 'absolute',
      transform: 'translate(-50%, -50%) translate(100px,50px)',
    })
  })

  it('renders React node as label', () => {
    render(<EdgeLabel labelX={100} labelY={50} label={<span data-testid="custom-label">Custom</span>} />)
    expect(screen.getByTestId('custom-label')).toBeInTheDocument()
  })
})
