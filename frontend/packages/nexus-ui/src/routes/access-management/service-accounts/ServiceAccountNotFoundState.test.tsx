import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { ServiceAccountNotFoundState } from './ServiceAccountNotFoundState'

describe('ServiceAccountNotFoundState', () => {
  it('renders not-found heading and description', () => {
    render(<ServiceAccountNotFoundState onBack={vi.fn()} onRetry={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Service account not found' })).toBeInTheDocument()
    expect(screen.getByText(/does not exist or may have been deleted/)).toBeInTheDocument()
  })

  it('calls onBack when back button is clicked', async () => {
    const onBack = vi.fn()
    const user = userEvent.setup()
    render(<ServiceAccountNotFoundState onBack={onBack} onRetry={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /back to service accounts/i }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('calls onRetry when retry button is clicked', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    render(<ServiceAccountNotFoundState onBack={vi.fn()} onRetry={onRetry} />)

    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<ServiceAccountNotFoundState onBack={vi.fn()} onRetry={vi.fn()} />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
