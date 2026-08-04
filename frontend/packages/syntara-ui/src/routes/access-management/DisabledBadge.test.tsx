import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { DisabledBadge } from './DisabledBadge'

describe('DisabledBadge', () => {
  it('renders "Disabled" text in a label', () => {
    render(<DisabledBadge />)
    expect(screen.getByText('Disabled')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<DisabledBadge />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
