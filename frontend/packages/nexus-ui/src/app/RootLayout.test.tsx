import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { RootLayout } from './RootLayout'

vi.mock('./AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="app-shell">{children}</div>,
}))

vi.mock('@tanstack/react-router', () => ({
  Outlet: () => <div data-testid="outlet" />,
}))

describe('RootLayout', () => {
  it('renders AppShell wrapping a router outlet', () => {
    render(<RootLayout />)
    expect(screen.getByTestId('app-shell')).toBeInTheDocument()
    expect(screen.getByTestId('outlet')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<RootLayout />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
