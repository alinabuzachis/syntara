import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { NxLoadingState } from './NxLoadingState'

describe('NxLoadingState', () => {
  it('has no accessibility violations', async () => {
    const { container } = render(<NxLoadingState />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('renders without crashing', () => {
    render(<NxLoadingState />)
    expect(screen.getByTestId('loading-state')).toBeInTheDocument()
  })

  it('displays a spinner with correct aria-label', () => {
    render(<NxLoadingState />)
    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeInTheDocument()
  })

  it('renders with centered layout', () => {
    render(<NxLoadingState />)
    const container = screen.getByTestId('loading-state')
    expect(container).toHaveClass('pf-v6-l-flex')
  })
})
