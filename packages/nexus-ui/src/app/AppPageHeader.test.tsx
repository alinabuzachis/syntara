import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { axe } from 'vitest-axe'

import { AppPageHeader } from './AppPageHeader'

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AppPageHeader', () => {
  it('renders title as string', () => {
    render(<AppPageHeader title="Test Title" />)

    expect(screen.getByRole('heading', { name: 'Test Title' })).toBeInTheDocument()
  })

  it('renders title as ReactNode', () => {
    render(<AppPageHeader title={<span>Custom Title</span>} />)

    expect(screen.getByText('Custom Title')).toBeInTheDocument()
  })

  it('renders without toolbar when no children', () => {
    render(<AppPageHeader title="No Toolbar" />)

    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
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

  it('does not render breadcrumbs when fewer than two items', () => {
    render(<AppPageHeader title="Page" breadcrumbs={[{ label: 'Only' }]} />)

    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Page' })).toBeInTheDocument()
  })

  it('renders breadcrumbs above the title when two or more items', () => {
    render(
      <AppPageHeader
        title="Create user"
        breadcrumbs={[
          { label: 'Access management', href: '/access-management' },
          { label: 'Users', href: '/access-management/users' },
          { label: 'Create user' },
        ]}
      />
    )

    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/access-management/users')
    expect(screen.getByRole('heading', { name: 'Create user' })).toBeInTheDocument()
  })

  it('has no accessibility violations with breadcrumbs', async () => {
    const { container } = render(
      <AppPageHeader
        title="Settings"
        breadcrumbs={[
          { label: 'Configuration', href: '/configuration/integrations' },
          { label: 'Settings', href: '/configuration/settings' },
          { label: 'System' },
        ]}
      />
    )

    expect(await axe(container)).toHaveNoViolations()
  })
})
