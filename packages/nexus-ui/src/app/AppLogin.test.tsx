import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AppLogin } from './AppLogin'

describe('AppLogin', () => {
  it('renders children when logged in', () => {
    render(
      <AppLogin>
        <div data-testid="app-content">App Content</div>
      </AppLogin>
    )

    expect(screen.getByTestId('app-content')).toBeInTheDocument()
    expect(screen.getByText('App Content')).toBeInTheDocument()
  })

  it('renders children without login prompt when isLoggedIn is true', () => {
    render(
      <AppLogin>
        <div>Protected Content</div>
      </AppLogin>
    )

    // Should show the children
    expect(screen.getByText('Protected Content')).toBeInTheDocument()

    // Should NOT show login prompt since isLoggedIn is hardcoded to true
    expect(screen.queryByText('Please log in to continue')).not.toBeInTheDocument()
  })

  it('handles undefined children', () => {
    const { container } = render(<AppLogin />)

    // Should render without crashing
    expect(container).toBeInTheDocument()
  })

  it('handles null children', () => {
    const { container } = render(<AppLogin>{null}</AppLogin>)

    // Should render without crashing
    expect(container).toBeInTheDocument()
  })
})
