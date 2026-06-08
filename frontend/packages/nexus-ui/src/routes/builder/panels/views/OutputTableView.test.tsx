import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { OutputTableView } from './OutputTableView'

describe('OutputTableView', () => {
  it('renders with the "Output data" aria-label', () => {
    render(<OutputTableView data={{ result: 'ok' }} />)

    expect(screen.getByRole('grid', { name: 'Output data' })).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<OutputTableView data={{ result: 'ok' }} />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
