import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AppPageHeader } from './AppPageHeader'

describe('AppPageHeader', () => {
  it('renders title as string', () => {
    render(<AppPageHeader title="Test Title" />)

    expect(screen.getByRole('heading', { name: 'Test Title' })).toBeInTheDocument()
  })

  it('renders title as ReactNode', () => {
    render(<AppPageHeader title={<span data-testid="custom-title">Custom Title</span>} />)

    expect(screen.getByTestId('custom-title')).toBeInTheDocument()
    expect(screen.getByText('Custom Title')).toBeInTheDocument()
  })

  it('renders without toolbar when no children', () => {
    const { container } = render(<AppPageHeader title="No Toolbar" />)

    // Should not have toolbar content when no children
    expect(container.querySelector('.pf-v6-c-toolbar')).not.toBeInTheDocument()
  })

  it('renders children in toolbar', () => {
    render(
      <AppPageHeader title="With Actions">
        <button>Action 1</button>
        <button>Action 2</button>
      </AppPageHeader>
    )

    expect(screen.getByRole('button', { name: 'Action 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Action 2' })).toBeInTheDocument()
  })

  it('renders heading at h1 level', () => {
    render(<AppPageHeader title="Main Heading" />)

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Main Heading')
  })
})
