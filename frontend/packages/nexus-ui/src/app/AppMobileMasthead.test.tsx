import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AppMobileMasthead } from './AppMobileMasthead'
import type { DockState } from './useDockState'

const mockOnMobileToggle = vi.fn()
const mockUseDockState = vi.fn<() => DockState>()

vi.mock('./useDockState', () => ({
  useDockState: (): DockState => mockUseDockState(),
}))

vi.mock('../assets/redhat-hat-icon.svg?react', () => ({
  default: (props: Record<string, unknown>) => <svg data-testid="hat-icon" {...props} />,
}))

describe('AppMobileMasthead', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDockState.mockReturnValue({
      isDockExpanded: false,
      isDockTextExpanded: false,
      isMobile: true,
      dockedToggleRef: { current: null },
      mobileToggleRef: { current: null },
      onToggleDock: vi.fn(),
      onMobileToggle: mockOnMobileToggle,
    })
  })

  it('renders the hamburger toggle button', () => {
    render(<AppMobileMasthead />)
    expect(screen.getByRole('button', { name: 'Global navigation' })).toBeInTheDocument()
  })

  it('renders the home logo link', () => {
    render(<AppMobileMasthead />)
    const logoLink = screen.getByRole('link', { name: 'Home' })
    expect(logoLink).toBeInTheDocument()
    expect(logoLink).toHaveAttribute('href', '/')
  })

  it('renders the hat icon SVG', () => {
    render(<AppMobileMasthead />)
    expect(screen.getByTestId('hat-icon')).toBeInTheDocument()
  })

  it('calls onMobileToggle when hamburger is clicked', async () => {
    const user = userEvent.setup()
    render(<AppMobileMasthead />)

    await user.click(screen.getByRole('button', { name: 'Global navigation' }))
    expect(mockOnMobileToggle).toHaveBeenCalledOnce()
  })

  it('renders correctly when dock is expanded', () => {
    mockUseDockState.mockReturnValue({
      isDockExpanded: true,
      isDockTextExpanded: false,
      isMobile: true,
      dockedToggleRef: { current: null },
      mobileToggleRef: { current: null },
      onToggleDock: vi.fn(),
      onMobileToggle: mockOnMobileToggle,
    })
    render(<AppMobileMasthead />)
    const toggle = screen.getByRole('button', { name: 'Global navigation' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })
})
