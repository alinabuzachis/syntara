import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PlaceholderNode } from './PlaceholderNode'

// Mock @xyflow/react
vi.mock('@xyflow/react', () => ({
  Handle: ({ type, id }: { type: string; id: string }) => <div data-testid={`handle-${type}-${id}`} />,
  Position: {
    Top: 'top',
    Bottom: 'bottom',
    Left: 'left',
    Right: 'right',
  },
}))

describe('PlaceholderNode', () => {
  it('renders without crashing', () => {
    const { container } = render(<PlaceholderNode />)
    expect(container).toBeInTheDocument()
  })

  it('renders with invisible styling', () => {
    const { container } = render(<PlaceholderNode />)
    const div = container.querySelector('div')
    expect(div).toHaveStyle({
      width: '10px',
      height: '10px',
      opacity: '0',
      pointerEvents: 'none',
    })
  })

  it('renders target and source handles', () => {
    render(<PlaceholderNode />)
    expect(screen.getByTestId('handle-target-target')).toBeInTheDocument()
    expect(screen.getByTestId('handle-source-source')).toBeInTheDocument()
  })
})
