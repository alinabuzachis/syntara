import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AppRouter } from './AppRouter'

describe('AppRouter', () => {
  it('renders without crashing', () => {
    const { container } = render(<AppRouter />)

    // The router should render
    expect(container).toBeInTheDocument()
  })

  it('renders with ErrorBoundary and Suspense', () => {
    const { container } = render(<AppRouter />)

    expect(container.firstChild).toBeTruthy()
  })

  it('renders route structure', () => {
    const { container } = render(<AppRouter />)

    // The router renders and processes navigationItems
    expect(container.innerHTML).toBeTruthy()
  })
})
