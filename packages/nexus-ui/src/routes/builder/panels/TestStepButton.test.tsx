import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { TestStepButton } from './TestStepButton'

describe('TestStepButton', () => {
  it('renders a "Test step" button', () => {
    render(<TestStepButton onTestStep={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Test step' })).toBeInTheDocument()
  })

  it('calls onTestStep when clicked', async () => {
    const user = userEvent.setup()
    const onTestStep = vi.fn()
    render(<TestStepButton onTestStep={onTestStep} />)

    await user.click(screen.getByRole('button', { name: 'Test step' }))

    expect(onTestStep).toHaveBeenCalledTimes(1)
  })

  it('shows loading spinner during pending state', () => {
    render(<TestStepButton onTestStep={vi.fn()} isPending />)

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /running/i })).toBeInTheDocument()
  })

  it('is disabled when isPending is true', () => {
    render(<TestStepButton onTestStep={vi.fn()} isPending />)

    expect(screen.getByRole('button', { name: /running/i })).toBeDisabled()
  })

  it('is disabled when isDisabled is true', () => {
    render(<TestStepButton onTestStep={vi.fn()} isDisabled />)

    expect(screen.getByRole('button', { name: 'Test step' })).toBeDisabled()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<TestStepButton onTestStep={vi.fn()} />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations when pending', async () => {
    const { container } = render(<TestStepButton onTestStep={vi.fn()} isPending />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
