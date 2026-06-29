import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { OutputTableView } from './OutputTableView'

describe('OutputTableView', () => {
  it('renders with the "Output data" aria-label', () => {
    render(<OutputTableView data={{ result: 'ok' }} />)

    expect(screen.getByRole('grid', { name: 'Output data' })).toBeInTheDocument()
  })

  it('renders URL values as clickable links', () => {
    const data = { job_url: 'https://aap.example.com/jobs/123' }
    render(<OutputTableView data={data} />)

    const link = screen.getByRole('link', { name: 'https://aap.example.com/jobs/123' })
    expect(link).toHaveAttribute('href', 'https://aap.example.com/jobs/123')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('does not render non-URL strings as links', () => {
    const data = { status: 'completed' }
    render(<OutputTableView data={data} />)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'completed' })).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<OutputTableView data={{ result: 'ok' }} />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations with URL values', async () => {
    const { container } = render(<OutputTableView data={{ job_url: 'https://aap.example.com/jobs/123' }} />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
