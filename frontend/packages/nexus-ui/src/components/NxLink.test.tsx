import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { NxLink } from './NxLink'

describe('NxLink', () => {
  it('renders as an anchor tag with the correct href', () => {
    render(<NxLink to="/some/path">Go somewhere</NxLink>)
    expect(screen.getByRole('link', { name: 'Go somewhere' })).toHaveAttribute('href', '/some/path')
  })

  it('applies PatternFly link button classes', () => {
    render(<NxLink to="/path">Link</NxLink>)
    const link = screen.getByRole('link', { name: 'Link' })
    expect(link).toHaveClass('pf-v6-c-button', 'pf-m-link', 'pf-m-inline')
  })

  it('merges custom className with PatternFly classes', () => {
    render(
      <NxLink to="/path" className="my-class">
        Link
      </NxLink>
    )
    const link = screen.getByRole('link', { name: 'Link' })
    expect(link).toHaveClass('pf-v6-c-button', 'pf-m-link', 'pf-m-inline', 'my-class')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<NxLink to="/path">Accessible link</NxLink>)
    expect(await axe(container)).toHaveNoViolations()
  })
})
