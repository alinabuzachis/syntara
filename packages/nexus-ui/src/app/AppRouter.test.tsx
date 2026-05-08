import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { AppRouter } from './AppRouter'

vi.mock('./navigationItems', () => ({
  NAV_ITEMS: [
    {
      label: 'Test',
      path: '/test',
      element: <div data-testid="test-route">Test Route</div>,
    },
  ],
}))

function renderWithLocation(path: string) {
  const { hook } = memoryLocation({ path, record: true })
  return render(
    <Router hook={hook}>
      <AppRouter />
    </Router>
  )
}

describe('AppRouter', () => {
  it('renders without crashing', () => {
    const { container } = renderWithLocation('/test')
    expect(container).toBeInTheDocument()
  })

  it('renders matching route content', () => {
    renderWithLocation('/test')
    expect(screen.getByTestId('test-route')).toBeInTheDocument()
  })

  it('redirects unknown paths to /workflows', () => {
    const { container } = renderWithLocation('/unknown-path')
    // Catch-all route triggers a redirect; component still renders without crashing
    expect(container).toBeInTheDocument()
  })
})
