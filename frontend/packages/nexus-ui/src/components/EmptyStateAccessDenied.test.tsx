import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { EmptyStateAccessDenied } from './EmptyStateAccessDenied'

describe('EmptyStateAccessDenied', () => {
  it('has no accessibility violations', async () => {
    const { container } = render(<EmptyStateAccessDenied description="You don't have permission to view settings." />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('renders the access denied title', () => {
    render(<EmptyStateAccessDenied description="Contact your administrator." />)

    expect(screen.getByText('Access denied')).toBeInTheDocument()
  })

  it('renders the provided description', () => {
    render(<EmptyStateAccessDenied description="You don't have permission to view this resource." />)

    expect(screen.getByText("You don't have permission to view this resource.")).toBeInTheDocument()
  })
})
