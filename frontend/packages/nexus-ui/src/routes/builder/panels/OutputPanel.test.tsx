import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { OutputPanel } from './OutputPanel'

const sampleOutput = { result: 'success', count: 5 }

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

  it('does not show view toggle when no output data', () => {
    render(<OutputPanel />)

    expect(screen.queryByRole('group', { name: 'Output view selection' })).not.toBeInTheDocument()
  })

  it('shows view toggle when output data exists', () => {
    render(<OutputPanel outputData={sampleOutput} />)

    expect(screen.getByRole('group', { name: 'Output view selection' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Schema' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Table' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'JSON' })).toBeInTheDocument()
  })

  it('defaults to JSON view when output data exists', () => {
    render(<OutputPanel outputData={sampleOutput} />)

    expect(screen.getByRole('button', { name: 'JSON' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/"result": "success"/)).toBeInTheDocument()
  })

  it('does not show empty state when output data exists', () => {
    render(<OutputPanel outputData={sampleOutput} />)

    expect(screen.queryByText('No output data')).not.toBeInTheDocument()
  })

  it('switches to Schema view', async () => {
    const user = userEvent.setup()
    render(<OutputPanel outputData={sampleOutput} />)

    await user.click(screen.getByRole('button', { name: 'Schema' }))

    const schemaTree = screen.getByRole('tree', { name: 'Output schema' })
    expect(schemaTree).toBeInTheDocument()
    expect(schemaTree).toHaveTextContent('result')
  })

  it('switches to Table view', async () => {
    const user = userEvent.setup()
    render(<OutputPanel outputData={sampleOutput} />)

    await user.click(screen.getByRole('button', { name: 'Table' }))

    expect(screen.getByRole('grid', { name: 'Output data' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'result' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'count' })).toBeInTheDocument()
  })

  it('switches back to JSON view', async () => {
    const user = userEvent.setup()
    render(<OutputPanel outputData={sampleOutput} />)

    await user.click(screen.getByRole('button', { name: 'Schema' }))
    await user.click(screen.getByRole('button', { name: 'JSON' }))

    expect(screen.getByText(/"result": "success"/)).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<OutputPanel />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations with JSON view', async () => {
    const { container } = render(<OutputPanel outputData={sampleOutput} />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations with Schema view', async () => {
    const user = userEvent.setup()
    const { container } = render(<OutputPanel outputData={sampleOutput} />)
    await user.click(screen.getByRole('button', { name: 'Schema' }))

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations with Table view', async () => {
    const user = userEvent.setup()
    const { container } = render(<OutputPanel outputData={sampleOutput} />)
    await user.click(screen.getByRole('button', { name: 'Table' }))

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
