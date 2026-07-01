import { useRouterState } from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { createTestRouter } from '../../test/createTestRouter'

import { Link } from './Link'

vi.mock('@tanstack/react-router', async () => vi.importActual('@tanstack/react-router'))

describe('Link', () => {
  it('renders an anchor element', async () => {
    const wrapper = createTestRouter('/')
    render(<Link href="/workflows">Go to workflows</Link>, { wrapper })
    expect(await screen.findByRole('link', { name: 'Go to workflows' })).toBeInTheDocument()
  })

  it('navigates to href on click', async () => {
    const user = userEvent.setup()
    const wrapper = createTestRouter('/')

    function LocationDisplay() {
      const pathname = useRouterState({ select: (s) => s.location.pathname })
      return <span data-testid="path">{pathname}</span>
    }

    render(
      <>
        <LocationDisplay />
        <Link href="/workflows">Go to workflows</Link>
      </>,
      { wrapper }
    )

    await user.click(await screen.findByRole('link', { name: 'Go to workflows' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/workflows'))
  })

  it('forwards additional anchor attributes', async () => {
    const wrapper = createTestRouter('/')
    render(
      <Link href="/workflows" className="my-class" aria-label="Workflows page">
        Workflows
      </Link>,
      { wrapper }
    )

    const link = await screen.findByRole('link', { name: 'Workflows page' })
    expect(link).toHaveClass('my-class')
  })

  it('has no accessibility violations', async () => {
    const wrapper = createTestRouter('/')
    const { container } = render(<Link href="/workflows">Go to workflows</Link>, { wrapper })
    await screen.findByRole('link', { name: 'Go to workflows' })
    expect(await axe(container)).toHaveNoViolations()
  })
})
