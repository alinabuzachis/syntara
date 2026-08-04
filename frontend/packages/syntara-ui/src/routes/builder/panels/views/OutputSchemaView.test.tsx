import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { OutputSchemaView } from './OutputSchemaView'

describe('OutputSchemaView', () => {
  it('renders nothing when data is null', () => {
    const { container } = render(<OutputSchemaView data={null} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders tree items for each field', () => {
    const data = { hostname: 'server1', port: 8080 }
    render(<OutputSchemaView data={data} />)

    const treeItems = screen.getAllByRole('treeitem')
    expect(treeItems).toHaveLength(2)
  })

  it('displays field names and values in tree items', () => {
    const data = { hostname: 'server1', port: 8080 }
    render(<OutputSchemaView data={data} />)

    const treeItems = screen.getAllByRole('treeitem')
    expect(treeItems[0]).toHaveTextContent('hostname')
    expect(treeItems[0]).toHaveTextContent('server1')
    expect(treeItems[1]).toHaveTextContent('port')
    expect(treeItems[1]).toHaveTextContent('8080')
  })

  it('shows type labels for different value types', () => {
    const data = { name: 'test', count: 5, active: true }
    render(<OutputSchemaView data={data} />)

    const treeItems = screen.getAllByRole('treeitem')
    expect(treeItems[0]).toHaveTextContent('T')
    expect(treeItems[1]).toHaveTextContent('#')
    expect(treeItems[2]).toHaveTextContent('✓')
  })

  it('renders nested objects as expandable branches', () => {
    const data = { response: { status: 'ok' } }
    render(<OutputSchemaView data={data} />)

    const treeItems = screen.getAllByRole('treeitem')
    expect(treeItems[0]).toHaveTextContent('response')
    expect(treeItems[0]).toHaveAttribute('aria-expanded', 'true')

    expect(treeItems[1]).toHaveTextContent('status')
    expect(treeItems[1]).toHaveTextContent('ok')
  })

  it('does not have draggable elements', () => {
    const data = { hostname: 'server1' }
    render(<OutputSchemaView data={data} />)

    screen.getAllByRole('treeitem').forEach((item) => {
      expect(item).not.toHaveAttribute('draggable')
    })
  })

  it('has the correct aria-label on the tree', () => {
    const data = { result: 'ok' }
    render(<OutputSchemaView data={data} />)

    expect(screen.getByRole('tree', { name: 'Output schema' })).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const data = { hostname: 'server1', port: 8080, nested: { key: 'value' } }
    const { container } = render(<OutputSchemaView data={data} />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations with null data', async () => {
    const { container } = render(<OutputSchemaView data={null} />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('renders URL values with an external link action button', () => {
    const data = { website: 'https://example.com' }
    render(<OutputSchemaView data={data} />)

    const link = screen.getByRole('link', { name: 'Open website in new tab' })
    expect(link).toHaveAttribute('href', 'https://example.com')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('does not render non-URL strings as links', () => {
    const data = { hostname: 'server1' }
    render(<OutputSchemaView data={data} />)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('server1')).toBeInTheDocument()
  })

  it('has no accessibility violations with URL values', async () => {
    const data = { website: 'https://example.com', name: 'test' }
    const { container } = render(<OutputSchemaView data={data} />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
