import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { EmptyStateServiceUnavailable } from './EmptyStateServiceUnavailable'

describe('EmptyStateServiceUnavailable', () => {
  it('renders with default title and description', () => {
    render(<EmptyStateServiceUnavailable />)

    expect(screen.getByText('Service Unavailable')).toBeInTheDocument()
    expect(
      screen.getByText(/The AI service is currently unavailable.*If this persists, contact your system administrator/)
    ).toBeInTheDocument()
  })

  it('renders with custom title', () => {
    render(<EmptyStateServiceUnavailable title="Custom Title" />)

    expect(screen.getByText('Custom Title')).toBeInTheDocument()
  })

  it('renders with custom description', () => {
    render(<EmptyStateServiceUnavailable description="Custom error message" />)

    expect(screen.getByText(/Custom error message.*If this persists/)).toBeInTheDocument()
  })

  it('hides admin hint when showAdminHint is false', () => {
    render(<EmptyStateServiceUnavailable showAdminHint={false} />)

    expect(
      screen.getByText('The AI service is currently unavailable. This may be a configuration issue.')
    ).toBeInTheDocument()
    expect(screen.queryByText(/contact your system administrator/)).not.toBeInTheDocument()
  })

  it('shows admin hint with custom description when showAdminHint is true', () => {
    render(<EmptyStateServiceUnavailable description="API key missing" showAdminHint={true} />)

    expect(screen.getByText('API key missing If this persists, contact your system administrator.')).toBeInTheDocument()
  })

  it('renders with all custom props', () => {
    render(
      <EmptyStateServiceUnavailable title="Backend Error" description="The backend is down" showAdminHint={false} />
    )

    expect(screen.getByText('Backend Error')).toBeInTheDocument()
    expect(screen.getByText('The backend is down')).toBeInTheDocument()
  })
})
