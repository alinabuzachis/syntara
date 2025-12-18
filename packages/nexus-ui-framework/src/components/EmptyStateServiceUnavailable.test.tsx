import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { EmptyStateServiceUnavailable } from './EmptyStateServiceUnavailable'

describe('EmptyStateServiceUnavailable', () => {
  it('renders with defaults', () => {
    render(<EmptyStateServiceUnavailable />)
    expect(screen.getByText('Service Unavailable')).toBeInTheDocument()
    expect(screen.getByText(/The AI service is currently unavailable/)).toBeInTheDocument()
  })

  it('renders custom description', () => {
    render(<EmptyStateServiceUnavailable description="OPENROUTER_API_KEY is required." />)
    expect(screen.getByText(/OPENROUTER_API_KEY is required/)).toBeInTheDocument()
  })

  it('renders custom title', () => {
    render(<EmptyStateServiceUnavailable title="API Configuration Error" />)
    expect(screen.getByText('API Configuration Error')).toBeInTheDocument()
  })

  it('shows admin hint by default', () => {
    render(<EmptyStateServiceUnavailable />)
    expect(screen.getByText(/contact your system administrator/)).toBeInTheDocument()
  })

  it('hides admin hint when disabled', () => {
    render(<EmptyStateServiceUnavailable showAdminHint={false} />)
    expect(screen.queryByText(/contact your system administrator/)).not.toBeInTheDocument()
  })
})
