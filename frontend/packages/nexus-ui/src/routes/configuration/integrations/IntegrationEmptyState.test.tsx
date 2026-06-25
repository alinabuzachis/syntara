import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { IntegrationEmptyState } from './IntegrationEmptyState'

// Mock wouter navigation
const mockNavigate = vi.fn()
vi.mock('../../../hooks/routing/navigate', () => ({
  navigate: (...args: unknown[]): void => {
    mockNavigate(...args)
  },
}))

describe('IntegrationEmptyState', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  it('renders empty state message', () => {
    render(<IntegrationEmptyState />)

    expect(screen.getByText('No integrations yet')).toBeInTheDocument()
  })

  it('renders description text', () => {
    render(<IntegrationEmptyState />)

    expect(screen.getByText(/Configure integrations to connect external tools/i)).toBeInTheDocument()
  })

  it('renders configure integration button', () => {
    render(<IntegrationEmptyState />)

    expect(screen.getByRole('button', { name: 'Configure integration' })).toBeInTheDocument()
  })

  it('navigates to configure page when button is clicked', async () => {
    const user = userEvent.setup()
    render(<IntegrationEmptyState />)

    const addButton = screen.getByRole('button', { name: 'Configure integration' })
    await user.click(addButton)

    expect(mockNavigate).toHaveBeenCalledWith('/configuration/integrations/configure')
  })

  it('renders the PF empty state icon', () => {
    render(<IntegrationEmptyState />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
