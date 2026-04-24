import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { InputTableView } from './InputTableView'

describe('InputTableView', () => {
  it('renders table with column headers from JSON keys', () => {
    const data = { timestamp: '2024-01-01', status: 'active' }
    render(<InputTableView data={data} />)

    expect(screen.getByRole('columnheader', { name: 'timestamp' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'status' })).toBeInTheDocument()
  })

  it('renders values in table cells', () => {
    const data = { name: 'workflow-1', count: 42 }
    render(<InputTableView data={data} />)

    expect(screen.getByRole('cell', { name: 'workflow-1' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '42' })).toBeInTheDocument()
  })

  it('renders multiple rows when data is an array', () => {
    const data = [
      { name: 'first', value: 1 },
      { name: 'second', value: 2 },
    ]
    render(<InputTableView data={data} />)

    expect(screen.getByRole('cell', { name: 'first' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'second' })).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(3) // 1 header + 2 data rows
  })

  it('handles empty data by rendering an empty table', () => {
    render(<InputTableView data={null} />)

    expect(screen.getByRole('grid', { name: 'Input data' })).toBeInTheDocument()
    expect(screen.queryAllByRole('cell')).toHaveLength(0)
  })

  it('handles nested object values by showing stringified JSON', () => {
    const data = { name: 'test', metadata: { key: 'val' } }
    render(<InputTableView data={data} />)

    expect(screen.getByRole('cell', { name: '{"key":"val"}' })).toBeInTheDocument()
  })

  it('handles array values by showing "[Array]"', () => {
    const data = { name: 'test', tags: ['a', 'b'] }
    render(<InputTableView data={data} />)

    expect(screen.getByRole('cell', { name: '[Array]' })).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const data = { timestamp: '2024-01-01', status: 'active' }
    const { container } = render(<InputTableView data={data} />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations with null data', async () => {
    const { container } = render(<InputTableView data={null} />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
