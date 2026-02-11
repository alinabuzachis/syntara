import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LoadingState } from './LoadingState'

describe('LoadingState', () => {
  it('renders without crashing', () => {
    render(<LoadingState />)
    expect(screen.getByTestId('loading-state')).toBeInTheDocument()
  })

  it('displays a spinner with correct aria-label', () => {
    render(<LoadingState />)
    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeInTheDocument()
  })

  it('renders with centered layout', () => {
    render(<LoadingState />)
    const container = screen.getByTestId('loading-state')
    expect(container).toHaveClass('pf-v6-l-flex')
  })
})
