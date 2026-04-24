import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { InputViewToggle } from './InputViewToggle'

describe('InputViewToggle', () => {
  it('renders three buttons: Schema, Table, JSON', () => {
    render(<InputViewToggle activeView="schema" onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Schema' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Table' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'JSON' })).toBeInTheDocument()
  })

  it('has Schema as active when activeView is schema', () => {
    render(<InputViewToggle activeView="schema" onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Schema' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'JSON' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onChange with table when Table button is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputViewToggle activeView="schema" onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Table' }))

    expect(onChange).toHaveBeenCalledWith('table')
  })

  it('calls onChange with json when JSON button is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputViewToggle activeView="schema" onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'JSON' }))

    expect(onChange).toHaveBeenCalledWith('json')
  })

  it('reflects activeView prop for each view', () => {
    const { rerender } = render(<InputViewToggle activeView="table" onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Schema' })).toHaveAttribute('aria-pressed', 'false')

    rerender(<InputViewToggle activeView="json" onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'JSON' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<InputViewToggle activeView="schema" onChange={vi.fn()} />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
