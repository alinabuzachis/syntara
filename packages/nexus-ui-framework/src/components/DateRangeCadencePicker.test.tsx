import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DateRangeCadencePicker } from './DateRangeCadencePicker'

describe('DateRangeCadencePicker Component', () => {
  it('renders start date, cadence, trigger time, and end date inputs', () => {
    render(<DateRangeCadencePicker showTime />)

    expect(screen.getByLabelText(/Start Date/i)).toBeInTheDocument()
    expect(screen.getByText('Cadence')).toBeInTheDocument()
    expect(screen.getByLabelText('Hour')).toBeInTheDocument()
    expect(screen.getByLabelText('Minute')).toBeInTheDocument()
    expect(screen.getByLabelText('Period')).toBeInTheDocument()
    expect(screen.getByLabelText(/End Date/i)).toBeInTheDocument()
    expect(screen.getByText('(Never ends)')).toBeInTheDocument()
  })

  it('parses and displays initial repeating interval value with end date', () => {
    const interval = 'R/2024-01-15T10:30:00.000Z/P1D/2024-12-31T23:59:59.000Z'
    render(<DateRangeCadencePicker value={interval} showTime />)

    const startInput = screen.getByLabelText(/Start Date/i) as HTMLInputElement
    const hourInput = screen.getByLabelText('Hour') as HTMLInputElement
    const minuteInput = screen.getByLabelText('Minute') as HTMLInputElement
    const endInput = screen.getByLabelText(/End Date/i) as HTMLInputElement

    expect(startInput.value).toBe('2024-01-15')
    // Hour depends on timezone, just check it has a value
    expect(hourInput.value).toBeTruthy()
    expect(minuteInput.value).toBe('30')
    expect(endInput.value).toBe('2024-12-31')
    expect(screen.queryByText('(Never ends)')).not.toBeInTheDocument()
  })

  it('parses and displays repeating interval value without end date', () => {
    const interval = 'R/2024-01-15T10:30:00.000Z/P1D'
    render(<DateRangeCadencePicker value={interval} showTime />)

    const endInput = screen.getByLabelText(/End Date/i) as HTMLInputElement
    expect(endInput.value).toBe('')
    expect(screen.getByText('(Never ends)')).toBeInTheDocument()
  })

  it('shows "Never ends" when end date is not set', () => {
    render(<DateRangeCadencePicker showTime />)

    expect(screen.getByText('(Never ends)')).toBeInTheDocument()
    const endInput = screen.getByLabelText(/End Date/i) as HTMLInputElement
    expect(endInput.value).toBe('')
  })

  it('hides "Never ends" when end date is set', () => {
    const interval = 'R/2024-01-15T10:30:00.000Z/P1D/2024-12-31T23:59:59.000Z'
    render(<DateRangeCadencePicker value={interval} showTime />)

    expect(screen.queryByText('(Never ends)')).not.toBeInTheDocument()
    const endInput = screen.getByLabelText(/End Date/i) as HTMLInputElement
    expect(endInput.value).toBe('2024-12-31')
  })

  it('calls onChange with ISO 8601 repeating interval when start date changes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    // Must provide a cadence value to get a valid output (default cadence is 'none' which outputs '')
    render(<DateRangeCadencePicker value="R/2024-01-01T10:00:00.000Z/P1D" onChange={onChange} showTime />)

    const startInput = screen.getByLabelText(/Start Date/i)
    await user.clear(startInput)
    await user.type(startInput, '2024-01-15')

    expect(onChange).toHaveBeenCalled()
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
    expect(lastCall).toContain('R/')
    expect(lastCall).toContain('2024-01-15')
  })

  it('includes end date in output when end date is set', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<DateRangeCadencePicker value="R/2024-01-15T10:00:00.000Z/P1D" onChange={onChange} showTime />)

    // Set end date
    const endInput = screen.getByLabelText(/End Date/i)
    await user.type(endInput, '2024-12-31')

    expect(onChange).toHaveBeenCalled()
    const calls = onChange.mock.calls
    const lastCall = calls[calls.length - 1][0]
    expect(lastCall).toContain('2024-12-31')
    expect(lastCall).toMatch(/R\/.*\/P1D\/.*/)
  })

  it('updates display when value prop changes', () => {
    const { rerender } = render(<DateRangeCadencePicker value="R/2024-01-15T10:30:00.000Z/P1D" showTime />)

    let startInput = screen.getByLabelText(/Start Date/i) as HTMLInputElement
    expect(startInput.value).toBe('2024-01-15')

    rerender(<DateRangeCadencePicker value="R/2024-02-10T08:00:00.000Z/P7D" showTime />)

    // Re-query after rerender
    startInput = screen.getByLabelText(/Start Date/i) as HTMLInputElement
    expect(startInput.value).toBe('2024-02-10')
  })

  it('applies error styling when error prop is true', () => {
    render(<DateRangeCadencePicker error showTime />)

    // Error styling is applied to the Cadence select and Period select (NativeSelect components)
    // The Input component doesn't support error styling
    const periodSelect = screen.getByLabelText('Period')
    expect(periodSelect).toHaveClass('ring-2', 'ring-red-400/50')
  })

  it('applies custom className', () => {
    const { container } = render(<DateRangeCadencePicker className="custom-class" />)

    const wrapper = container.querySelector('.custom-class')
    expect(wrapper).toBeInTheDocument()
  })

  it('handles empty value gracefully', () => {
    render(<DateRangeCadencePicker value="" showTime />)

    const startInput = screen.getByLabelText(/Start Date/i) as HTMLInputElement
    expect(startInput.value).toBe('')
  })

  it('emits empty string when required fields are not filled', async () => {
    const onChange = vi.fn()
    render(<DateRangeCadencePicker value="R/2024-01-15T10:00:00.000Z/P1D" onChange={onChange} showTime />)

    const startInput = screen.getByLabelText(/Start Date/i)
    await userEvent.clear(startInput)

    expect(onChange).toHaveBeenCalledWith('')
  })

  it('uses default cadence of "none" when no value provided', async () => {
    const onChange = vi.fn()
    render(<DateRangeCadencePicker onChange={onChange} showTime />)

    const startInput = screen.getByLabelText(/Start Date/i)
    await userEvent.type(startInput, '2024-01-15')

    // Should emit empty string since default cadence is 'none'
    const calls = onChange.mock.calls
    if (calls.length > 0) {
      const lastCall = calls[calls.length - 1][0]
      expect(lastCall).toBe('')
    }
  })

  it('marks start date and cadence as required', () => {
    render(<DateRangeCadencePicker />)

    expect(screen.getByText(/Start Date/)).toBeInTheDocument()
    expect(screen.getAllByText(/\*/).length).toBeGreaterThan(0)
  })

  it('updates trigger time correctly', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<DateRangeCadencePicker value="R/2024-01-15T10:00:00.000Z/P1D" onChange={onChange} showTime />)

    const hourInput = screen.getByLabelText('Hour')
    await user.clear(hourInput)
    await user.type(hourInput, '3')

    const periodSelect = screen.getByLabelText('Period')
    await user.selectOptions(periodSelect, 'PM')

    expect(onChange).toHaveBeenCalled()
    const calls = onChange.mock.calls
    if (calls.length > 0) {
      const lastCall = calls[calls.length - 1][0]
      // Time output is timezone-dependent, just verify it's a valid interval
      expect(lastCall).toMatch(/^R\/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\/P1D$/)
    }
  })

  it('hides trigger time when showTime is false', () => {
    render(<DateRangeCadencePicker showTime={false} />)

    expect(screen.queryByLabelText('Hour')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Minute')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Period')).not.toBeInTheDocument()
  })
})
