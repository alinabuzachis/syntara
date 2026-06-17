import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { PathExpressionHelp } from './PathExpressionHelp'

describe('PathExpressionHelp', () => {
  it('renders help icon button', () => {
    render(<PathExpressionHelp />)
    const button = screen.getByRole('button', { name: /path expression help/i })
    expect(button).toBeInTheDocument()
  })

  it('shows popover content when clicked', async () => {
    const user = userEvent.setup()
    render(<PathExpressionHelp />)

    const button = screen.getByRole('button', { name: /path expression help/i })
    await user.click(button)

    expect(screen.getByText(/Visual expression builder/i)).toBeInTheDocument()
    expect(screen.getByText(/Custom expression/i)).toBeInTheDocument()
  })

  it('displays path-specific description in popover', async () => {
    const user = userEvent.setup()
    render(<PathExpressionHelp />)

    const button = screen.getByRole('button', { name: /path expression help/i })
    await user.click(button)

    expect(screen.getByText(/first path whose condition evaluates to true/i)).toBeInTheDocument()
  })
})
