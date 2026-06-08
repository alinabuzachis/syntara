import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { ViewToggle } from './ViewToggle'

describe('ViewToggle', () => {
  it('renders three buttons: Schema, Table, JSON', () => {
    render(<ViewToggle activeView="schema" onChange={vi.fn()} ariaLabel="Input view selection" />)

    expect(screen.getByRole('button', { name: 'Schema' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Table' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'JSON' })).toBeInTheDocument()
  })

  it('has Schema as active when activeView is schema', () => {
    render(<ViewToggle activeView="schema" onChange={vi.fn()} ariaLabel="Input view selection" />)

    expect(screen.getByRole('button', { name: 'Schema' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'JSON' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onChange with table when Table button is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ViewToggle activeView="schema" onChange={onChange} ariaLabel="Input view selection" />)

    await user.click(screen.getByRole('button', { name: 'Table' }))

    expect(onChange).toHaveBeenCalledWith('table')
  })

  it('calls onChange with json when JSON button is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ViewToggle activeView="schema" onChange={onChange} ariaLabel="Input view selection" />)

    await user.click(screen.getByRole('button', { name: 'JSON' }))

    expect(onChange).toHaveBeenCalledWith('json')
  })

  it('reflects activeView prop for each view', () => {
    const { rerender } = render(<ViewToggle activeView="table" onChange={vi.fn()} ariaLabel="Test" />)

    expect(screen.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Schema' })).toHaveAttribute('aria-pressed', 'false')

    rerender(<ViewToggle activeView="json" onChange={vi.fn()} ariaLabel="Test" />)

    expect(screen.getByRole('button', { name: 'JSON' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('uses the provided ariaLabel', () => {
    render(<ViewToggle activeView="schema" onChange={vi.fn()} ariaLabel="Output view selection" />)

    expect(screen.getByRole('group', { name: 'Output view selection' })).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<ViewToggle activeView="schema" onChange={vi.fn()} ariaLabel="Test view" />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
