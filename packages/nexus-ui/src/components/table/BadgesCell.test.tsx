import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { BadgesCell } from './BadgesCell'

describe('BadgesCell', () => {
  it('returns null when items is empty', () => {
    const { container } = render(<BadgesCell items={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders each item as a compact outlined label', () => {
    render(<BadgesCell items={['a', 'b', 'c']} />)
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('b')).toBeInTheDocument()
    expect(screen.getByText('c')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<BadgesCell items={['production', 'deploy']} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
