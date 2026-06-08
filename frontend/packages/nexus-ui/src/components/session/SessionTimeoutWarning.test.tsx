import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import * as useSessionTimeoutModule from '../../hooks/useSessionTimeout'
import type { SessionTimeoutPhase } from '../../hooks/useSessionTimeout'

import { SessionTimeoutWarning } from './SessionTimeoutWarning'

function mockSessionTimeout(overrides: {
  phase?: SessionTimeoutPhase
  remainingSeconds?: number
  continueSession?: () => void
  logOut?: () => void
}) {
  const defaults = {
    phase: 'active' as SessionTimeoutPhase,
    remainingSeconds: 120,
    continueSession: vi.fn(),
    logOut: vi.fn(),
  }
  return vi.spyOn(useSessionTimeoutModule, 'useSessionTimeout').mockReturnValue({
    ...defaults,
    ...overrides,
  })
}

describe('SessionTimeoutWarning', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not render when phase is active', () => {
    mockSessionTimeout({ phase: 'active' })
    render(<SessionTimeoutWarning />)

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('renders the warning modal when phase is warning', () => {
    mockSessionTimeout({ phase: 'warning', remainingSeconds: 90 })
    render(<SessionTimeoutWarning />)

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText(/your session is about to expire/i)).toBeInTheDocument()
  })

  it('displays the countdown in seconds', () => {
    mockSessionTimeout({ phase: 'warning', remainingSeconds: 45 })
    render(<SessionTimeoutWarning />)

    expect(screen.getByText('45')).toBeInTheDocument()
    expect(screen.getByText(/seconds/)).toBeInTheDocument()
  })

  it('uses singular "second" when remainingSeconds is 1', () => {
    mockSessionTimeout({ phase: 'warning', remainingSeconds: 1 })
    render(<SessionTimeoutWarning />)

    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText(/second\./)).toBeInTheDocument()
  })

  it('calls continueSession when "Continue session" is clicked', async () => {
    const user = userEvent.setup()
    const continueSession = vi.fn()
    mockSessionTimeout({ phase: 'warning', continueSession })
    render(<SessionTimeoutWarning />)

    await user.click(screen.getByRole('button', { name: /continue session/i }))

    expect(continueSession).toHaveBeenCalledOnce()
  })

  it('calls logOut when "Log out" is clicked', async () => {
    const user = userEvent.setup()
    const logOut = vi.fn()
    mockSessionTimeout({ phase: 'warning', logOut })
    render(<SessionTimeoutWarning />)

    await user.click(screen.getByRole('button', { name: /log out/i }))

    expect(logOut).toHaveBeenCalledOnce()
  })

  it('has aria-live on the countdown text', () => {
    mockSessionTimeout({ phase: 'warning', remainingSeconds: 30 })
    render(<SessionTimeoutWarning />)

    expect(screen.getByText(/you will be logged out/i)).toHaveAttribute('aria-live', 'assertive')
  })

  it('has no accessibility violations when the modal is open', async () => {
    mockSessionTimeout({ phase: 'warning', remainingSeconds: 60 })
    const { container } = render(<SessionTimeoutWarning />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations when the modal is closed', async () => {
    mockSessionTimeout({ phase: 'active' })
    const { container } = render(<SessionTimeoutWarning />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
