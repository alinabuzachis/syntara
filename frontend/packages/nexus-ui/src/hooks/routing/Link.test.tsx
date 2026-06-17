import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { createTestRouter } from '../../test/createTestRouter'

import { Link } from './Link'
import { useLocation } from './useLocation'

function LocationDisplay() {
  const path = useLocation()
  return <span data-testid="path">{path}</span>
}

describe('Link', () => {
  it('renders an anchor element', () => {
    const wrapper = createTestRouter('/')
    render(<Link href="/workflows">Go to workflows</Link>, { wrapper })

    expect(screen.getByRole('link', { name: 'Go to workflows' })).toBeInTheDocument()
  })

  it('navigates to href on click', async () => {
    const user = userEvent.setup()
    const wrapper = createTestRouter('/')
    render(
      <>
        <LocationDisplay />
        <Link href="/workflows">Go to workflows</Link>
      </>,
      { wrapper }
    )

    await user.click(screen.getByRole('link', { name: 'Go to workflows' }))

    expect(screen.getByTestId('path')).toHaveTextContent('/workflows')
  })

  it('forwards additional anchor attributes', () => {
    const wrapper = createTestRouter('/')
    render(
      <Link href="/workflows" className="my-class" aria-label="Workflows page">
        Workflows
      </Link>,
      { wrapper }
    )

    const link = screen.getByRole('link', { name: 'Workflows page' })
    expect(link).toHaveClass('my-class')
  })

  it('has no accessibility violations', async () => {
    const wrapper = createTestRouter('/')
    const { container } = render(<Link href="/workflows">Go to workflows</Link>, { wrapper })

    expect(await axe(container)).toHaveNoViolations()
  })
})
