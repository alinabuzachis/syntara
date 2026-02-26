import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ConditionalExpressionHelp } from './ConditionalExpressionHelp'

describe('ConditionalExpressionHelp', () => {
  it('renders help icon button', () => {
    render(<ConditionalExpressionHelp />)
    const button = screen.getByRole('button', { name: /conditional expression help/i })
    expect(button).toBeInTheDocument()
  })

  it('shows popover content when clicked', async () => {
    const user = userEvent.setup()
    render(<ConditionalExpressionHelp />)

    const button = screen.getByRole('button', { name: /conditional expression help/i })
    await user.click(button)

    expect(screen.getByText(/Visual expression builder/i)).toBeInTheDocument()
    expect(screen.getByText(/Custom expression/i)).toBeInTheDocument()
  })

  it('displays format hint in popover', async () => {
    const user = userEvent.setup()
    render(<ConditionalExpressionHelp />)

    const button = screen.getByRole('button', { name: /conditional expression help/i })
    await user.click(button)

    expect(screen.getByText(/\$\{variable operator value\}/)).toBeInTheDocument()
  })
})
