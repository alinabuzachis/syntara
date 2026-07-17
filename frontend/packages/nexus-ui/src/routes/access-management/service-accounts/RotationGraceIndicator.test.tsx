import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { RotationGraceIndicator } from './RotationGraceIndicator'

function futureDate(minutesFromNow: number): string {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString()
}

describe('RotationGraceIndicator', () => {
  it('renders indicator when old_secret_valid_until is in the future', () => {
    render(<RotationGraceIndicator oldSecretValidUntil={futureDate(44)} />)

    expect(screen.getByText(/rotating/i)).toBeInTheDocument()
    expect(screen.getByText(/left/i)).toBeInTheDocument()
    expect(screen.getByText(/expires/i)).toBeInTheDocument()
  })

  it('renders nothing when old_secret_valid_until is null', () => {
    const { container } = render(<RotationGraceIndicator oldSecretValidUntil={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when old_secret_valid_until is undefined', () => {
    const { container } = render(<RotationGraceIndicator oldSecretValidUntil={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when old_secret_valid_until is in the past', () => {
    const pastDate = new Date(Date.now() - 60_000).toISOString()
    const { container } = render(<RotationGraceIndicator oldSecretValidUntil={pastDate} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows remaining time in the label', () => {
    render(<RotationGraceIndicator oldSecretValidUntil={futureDate(90)} />)

    expect(screen.getByText(/1h 30m left/)).toBeInTheDocument()
  })

  it('shows tooltip on keyboard focus', async () => {
    const user = userEvent.setup()
    render(<RotationGraceIndicator oldSecretValidUntil={futureDate(44)} />)

    await user.tab()

    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent(/the previous secret is still valid/i)
  })

  it('shows tooltip on hover with expiry details', async () => {
    const user = userEvent.setup()
    render(<RotationGraceIndicator oldSecretValidUntil={futureDate(44)} />)

    const label = screen.getByText(/rotating/i)
    await user.hover(label)

    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent(/the previous secret is still valid/i)
    expect(tooltip).toHaveTextContent(/ensure all systems are updated/i)
  })

  it('formats hours-only duration correctly', () => {
    render(<RotationGraceIndicator oldSecretValidUntil={futureDate(120)} />)

    expect(screen.getByText(/2h left/)).toBeInTheDocument()
  })

  it('formats minutes-only duration correctly', () => {
    render(<RotationGraceIndicator oldSecretValidUntil={futureDate(15)} />)

    expect(screen.getByText(/15m left/)).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<RotationGraceIndicator oldSecretValidUntil={futureDate(44)} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations when hidden', async () => {
    const { container } = render(<RotationGraceIndicator oldSecretValidUntil={null} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
