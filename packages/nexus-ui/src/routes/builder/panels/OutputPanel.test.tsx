import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { OutputPanel } from './OutputPanel'

describe('OutputPanel', () => {
  it('shows "Output" title in header', () => {
    render(<OutputPanel />)

    expect(screen.getByRole('heading', { name: 'Output' })).toBeInTheDocument()
  })

  it('shows empty state with "No output data" when no execution data exists', () => {
    render(<OutputPanel />)

    expect(screen.getByText('No output data')).toBeInTheDocument()
  })

  it('shows empty state when outputData is null', () => {
    render(<OutputPanel outputData={null} />)

    expect(screen.getByText('No output data')).toBeInTheDocument()
  })

  it('renders OutputJsonView when output data exists', () => {
    const outputData = { result: 'success', count: 5 }
    render(<OutputPanel outputData={outputData} />)

    expect(screen.getByText(/"result": "success"/)).toBeInTheDocument()
    expect(screen.getByText(/"count": 5/)).toBeInTheDocument()
  })

  it('does not show empty state when output data exists', () => {
    const outputData = { result: 'success' }
    render(<OutputPanel outputData={outputData} />)

    expect(screen.queryByText('No output data')).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<OutputPanel />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations with output data', async () => {
    const outputData = { result: 'success', count: 5 }
    const { container } = render(<OutputPanel outputData={outputData} />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
