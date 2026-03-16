import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BadgesCell } from './BadgesCell'

describe('BadgesCell', () => {
  it('returns null when items is empty', () => {
    const { container } = render(<BadgesCell items={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders each item as a badge', () => {
    render(<BadgesCell items={['a', 'b', 'c']} />)
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('b')).toBeInTheDocument()
    expect(screen.getByText('c')).toBeInTheDocument()
  })
})
