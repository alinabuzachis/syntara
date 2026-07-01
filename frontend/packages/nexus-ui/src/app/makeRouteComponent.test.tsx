import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { useCanI } from '../hooks/useCanI'

import { makeRouteComponent } from './makeRouteComponent'

vi.mock('../hooks/useCanI', () => ({
  useCanI: vi.fn(() => ({ allowed: true, isChecking: false, isError: false })),
}))

describe('makeRouteComponent', () => {
  it('renders the element without a permission guard', () => {
    const RouteComponent = makeRouteComponent(<div>Page content</div>)
    render(<RouteComponent />)
    expect(screen.getByText('Page content')).toBeInTheDocument()
  })

  it('wraps the element in ProtectedRoute when routePermission is provided', () => {
    vi.mocked(useCanI).mockReturnValue({ allowed: true, isChecking: false, isError: false })
    const RouteComponent = makeRouteComponent(<div>Guarded content</div>, {
      action: 'create',
      resourceType: 'workflow',
    })
    render(<RouteComponent />)
    expect(screen.getByText('Guarded content')).toBeInTheDocument()
    expect(useCanI).toHaveBeenCalledWith('create', 'workflow')
  })

  it('shows access denied when permission is denied', () => {
    vi.mocked(useCanI).mockReturnValue({ allowed: false, isChecking: false, isError: false })
    const RouteComponent = makeRouteComponent(<div>Secret</div>, {
      action: 'create',
      resourceType: 'user',
    })
    render(<RouteComponent />)
    expect(screen.queryByText('Secret')).not.toBeInTheDocument()
    expect(screen.getByText('Access denied')).toBeInTheDocument()
  })

  it('renders an ErrorBoundary that catches thrown errors', () => {
    const ThrowingChild = () => {
      throw new Error('Boom')
    }
    const RouteComponent = makeRouteComponent(<ThrowingChild />)
    render(<RouteComponent />)
    expect(screen.getByRole('heading', { level: 2, name: 'Something went wrong' })).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const RouteComponent = makeRouteComponent(<div>Accessible content</div>)
    const { container } = render(<RouteComponent />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
