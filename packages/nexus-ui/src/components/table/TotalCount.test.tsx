import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { TotalCount } from './TotalCount'

describe('TotalCount', () => {
  it('renders the total count with correct format', () => {
    render(<TotalCount total={42} />)
    expect(screen.getByText(/of 42 total/)).toBeInTheDocument()
  })

  it('renders with total of zero', () => {
    render(<TotalCount total={0} />)
    expect(screen.getByText(/of 0 total/)).toBeInTheDocument()
  })

  it('renders with large numbers', () => {
    render(<TotalCount total={10000} />)
    expect(screen.getByText(/of 10000 total/)).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<TotalCount total={42} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
