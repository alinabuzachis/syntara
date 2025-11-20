import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Cadence } from './Cadence'

describe('Cadence Component', () => {
  it('renders with default value "none"', () => {
    render(<Cadence />)

    const select = screen.getByLabelText('Cadence') as HTMLSelectElement
    expect(select.value).toBe('none')
  })

  it('renders all cadence options', () => {
    render(<Cadence />)

    expect(screen.getByRole('option', { name: 'Does not repeat' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Daily' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Weekly' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Monthly' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Annually' })).toBeInTheDocument()
  })

  it('displays the provided value', () => {
    render(<Cadence value="daily" />)

    const select = screen.getByLabelText('Cadence') as HTMLSelectElement
    expect(select.value).toBe('daily')
  })

  it('calls onChange when value changes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<Cadence onChange={onChange} />)

    const select = screen.getByLabelText('Cadence')
    await user.selectOptions(select, 'weekly')

    expect(onChange).toHaveBeenCalledWith('weekly')
  })

  it('renders with custom label', () => {
    render(<Cadence label="Recurrence Pattern" />)

    expect(screen.getByText('Recurrence Pattern')).toBeInTheDocument()
  })

  it('shows required asterisk when required prop is true', () => {
    render(<Cadence label="Cadence" required />)

    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('applies error styling when error prop is true', () => {
    render(<Cadence error />)

    const select = screen.getByLabelText('Cadence')
    expect(select).toHaveClass('ring-2', 'ring-red-400/50')
  })

  it('applies custom className', () => {
    const { container } = render(<Cadence className="custom-class" />)

    const wrapper = container.querySelector('.custom-class')
    expect(wrapper).toBeInTheDocument()
  })

  it('disables select when disabled prop is true', () => {
    render(<Cadence disabled />)

    const select = screen.getByLabelText('Cadence')
    expect(select).toBeDisabled()
  })

  it('applies disabled styling when disabled', () => {
    render(<Cadence disabled />)

    const select = screen.getByLabelText('Cadence')
    expect(select).toHaveClass('opacity-50', 'cursor-not-allowed')
  })

  it('updates when value prop changes', () => {
    const { rerender } = render(<Cadence value="daily" />)

    let select = screen.getByLabelText('Cadence') as HTMLSelectElement
    expect(select.value).toBe('daily')

    rerender(<Cadence value="monthly" />)

    select = screen.getByLabelText('Cadence') as HTMLSelectElement
    expect(select.value).toBe('monthly')
  })

  it('calls onChange with correct value for each option', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<Cadence onChange={onChange} />)

    const select = screen.getByLabelText('Cadence')

    await user.selectOptions(select, 'daily')
    expect(onChange).toHaveBeenCalledWith('daily')

    await user.selectOptions(select, 'weekly')
    expect(onChange).toHaveBeenCalledWith('weekly')

    await user.selectOptions(select, 'monthly')
    expect(onChange).toHaveBeenCalledWith('monthly')

    await user.selectOptions(select, 'annually')
    expect(onChange).toHaveBeenCalledWith('annually')

    await user.selectOptions(select, 'none')
    expect(onChange).toHaveBeenCalledWith('none')
  })
})
