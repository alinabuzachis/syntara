import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DateRangeCadencePicker } from './DateRangeCadencePicker'

describe('DateRangeCadencePicker', () => {
  describe('rendering', () => {
    it('renders all form fields', () => {
      render(<DateRangeCadencePicker />)

      expect(screen.getByLabelText('Start date')).toBeInTheDocument()
      expect(screen.getByLabelText('Cadence')).toBeInTheDocument()
      expect(screen.getByLabelText('Hour')).toBeInTheDocument()
      expect(screen.getByLabelText('Minute')).toBeInTheDocument()
      expect(screen.getByLabelText('Period')).toBeInTheDocument()
      expect(screen.getByLabelText('End date')).toBeInTheDocument()
    })

    it('renders cadence options', () => {
      render(<DateRangeCadencePicker />)

      const cadenceSelect = screen.getByLabelText('Cadence')
      expect(cadenceSelect).toBeInTheDocument()

      // Check for all cadence options
      expect(screen.getByRole('option', { name: 'Does not repeat' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Daily' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Weekly' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Monthly' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Annually' })).toBeInTheDocument()
    })

    it('renders time period options', () => {
      render(<DateRangeCadencePicker />)

      expect(screen.getByRole('option', { name: 'AM' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'PM' })).toBeInTheDocument()
    })

    it('hides time inputs when showTime is false', () => {
      render(<DateRangeCadencePicker showTime={false} />)

      expect(screen.queryByLabelText('Hour')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Minute')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Period')).not.toBeInTheDocument()
    })

    it('shows time inputs by default', () => {
      render(<DateRangeCadencePicker />)

      expect(screen.getByLabelText('Hour')).toBeInTheDocument()
      expect(screen.getByLabelText('Minute')).toBeInTheDocument()
      expect(screen.getByLabelText('Period')).toBeInTheDocument()
    })

    it('passes required prop to form groups', () => {
      const { container } = render(<DateRangeCadencePicker required />)

      const requiredIndicators = container.querySelectorAll('.pf-v6-c-form__label-required')
      expect(requiredIndicators).toHaveLength(3)
    })

    it('does not mark form groups as required when required is false', () => {
      const { container } = render(<DateRangeCadencePicker />)

      const requiredIndicators = container.querySelectorAll('.pf-v6-c-form__label-required')
      expect(requiredIndicators).toHaveLength(0)
    })

    it('applies custom className', () => {
      const { container } = render(<DateRangeCadencePicker className="custom-class" />)

      const stack = container.querySelector('.pf-v6-l-stack')
      expect(stack).toHaveClass('custom-class')
    })

    it('applies error state to start date field only when error prop is true', () => {
      render(<DateRangeCadencePicker error />)

      const startDateInput = screen.getByLabelText('Start date')
      expect(startDateInput).toHaveAttribute('aria-invalid', 'true')

      const cadenceSelect = screen.getByLabelText('Cadence')
      expect(cadenceSelect).not.toHaveAttribute('aria-invalid', 'true')
    })

    it('shows error message under Start date when error and errorMessage are set', () => {
      render(<DateRangeCadencePicker error errorMessage="Start date is required" />)

      expect(screen.getByText('Start date is required')).toBeInTheDocument()
    })
  })

  describe('initial value parsing', () => {
    it('parses daily interval', () => {
      render(<DateRangeCadencePicker value="R/2024-01-15T10:00:00Z/P1D" />)

      expect(screen.getByLabelText('Start date')).toHaveValue('2024-01-15')
      expect(screen.getByLabelText('Cadence')).toHaveValue('daily')
    })

    it('parses weekly interval', () => {
      render(<DateRangeCadencePicker value="R/2024-01-15T10:00:00Z/P7D" />)

      expect(screen.getByLabelText('Cadence')).toHaveValue('weekly')
    })

    it('parses weekly interval with P1W format', () => {
      render(<DateRangeCadencePicker value="R/2024-01-15T10:00:00Z/P1W" />)

      expect(screen.getByLabelText('Cadence')).toHaveValue('weekly')
    })

    it('parses monthly interval', () => {
      render(<DateRangeCadencePicker value="R/2024-01-15T10:00:00Z/P1M" />)

      expect(screen.getByLabelText('Cadence')).toHaveValue('monthly')
    })

    it('parses annually interval', () => {
      render(<DateRangeCadencePicker value="R/2024-01-15T10:00:00Z/P1Y" />)

      expect(screen.getByLabelText('Cadence')).toHaveValue('annually')
    })

    it('parses interval with end date', () => {
      render(<DateRangeCadencePicker value="R/2024-01-15T10:00:00Z/P1D/2024-12-31T23:59:59Z" />)

      expect(screen.getByLabelText('Start date')).toHaveValue('2024-01-15')
      expect(screen.getByLabelText('End date')).toHaveValue('2024-12-31')
    })

    it('parses time from interval', () => {
      render(<DateRangeCadencePicker value="R/2024-01-15T09:30:00Z/P1D" />)

      // Verify time inputs are populated (actual values depend on timezone)
      const hourInput = screen.getByLabelText('Hour')
      const minuteInput = screen.getByLabelText('Minute')
      const periodSelect = screen.getByLabelText('Period')

      expect(hourInput).toBeInTheDocument()
      expect(minuteInput).toBeInTheDocument()
      expect(periodSelect).toBeInTheDocument()

      // Hour should be a valid 12-hour value (1-12)
      const hourValue = Number(hourInput.getAttribute('value'))
      expect(hourValue).toBeGreaterThanOrEqual(1)
      expect(hourValue).toBeLessThanOrEqual(12)
    })

    it('parses time and sets period', () => {
      render(<DateRangeCadencePicker value="R/2024-01-15T14:45:00Z/P1D" />)

      const periodSelect = screen.getByLabelText<HTMLSelectElement>('Period')
      // Period should be either AM or PM
      expect(['AM', 'PM']).toContain(periodSelect.value)
    })

    it('handles empty value', () => {
      render(<DateRangeCadencePicker value="" />)

      expect(screen.getByLabelText('Start date')).toHaveValue('')
      expect(screen.getByLabelText('Cadence')).toHaveValue('none')
    })

    it('handles undefined value', () => {
      render(<DateRangeCadencePicker />)

      expect(screen.getByLabelText('Start date')).toHaveValue('')
      expect(screen.getByLabelText('Cadence')).toHaveValue('none')
    })
  })

  describe('onChange callbacks', () => {
    it('calls onChange when start date changes', async () => {
      const onChange = vi.fn()
      render(<DateRangeCadencePicker onChange={onChange} value="R/2024-01-15T10:00:00Z/P1D" />)

      const startDate = screen.getByLabelText('Start date')
      fireEvent.change(startDate, { target: { value: '2024-02-01' } })

      await waitFor(() => {
        expect(onChange).toHaveBeenCalled()
        const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
        expect(lastCall).toContain('2024-02-01')
      })
    })

    it('calls onChange when cadence changes', async () => {
      const onChange = vi.fn()
      render(<DateRangeCadencePicker onChange={onChange} value="R/2024-01-15T10:00:00Z/P1D" />)

      const cadenceSelect = screen.getByLabelText('Cadence')
      fireEvent.change(cadenceSelect, { target: { value: 'weekly' } })

      await waitFor(() => {
        expect(onChange).toHaveBeenCalled()
        const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
        expect(lastCall).toContain('P7D')
      })
    })

    it('calls onChange with run-once interval (R1/start/PT0S) when cadence is none and start date is set', async () => {
      const onChange = vi.fn()
      render(<DateRangeCadencePicker onChange={onChange} value="R/2024-01-15T10:00:00Z/P1D" />)

      const cadenceSelect = screen.getByLabelText('Cadence')
      fireEvent.change(cadenceSelect, { target: { value: 'none' } })

      await waitFor(() => {
        expect(onChange).toHaveBeenLastCalledWith(expect.stringMatching(/^R1\/.+\/PT0S$/))
      })
    })

    it('calls onChange when hour changes', async () => {
      const onChange = vi.fn()
      render(<DateRangeCadencePicker onChange={onChange} value="R/2024-01-15T10:00:00Z/P1D" />)

      const hourInput = screen.getByLabelText('Hour')
      fireEvent.change(hourInput, { target: { value: '3' } })

      await waitFor(() => {
        expect(onChange).toHaveBeenCalled()
      })
    })

    it('calls onChange when minute changes', async () => {
      const onChange = vi.fn()
      render(<DateRangeCadencePicker onChange={onChange} value="R/2024-01-15T10:00:00Z/P1D" />)

      const minuteInput = screen.getByLabelText('Minute')
      fireEvent.change(minuteInput, { target: { value: '45' } })

      await waitFor(() => {
        expect(onChange).toHaveBeenCalled()
      })
    })

    it('calls onChange when period changes', async () => {
      const onChange = vi.fn()
      render(<DateRangeCadencePicker onChange={onChange} value="R/2024-01-15T10:00:00Z/P1D" />)

      const periodSelect = screen.getByLabelText('Period')
      fireEvent.change(periodSelect, { target: { value: 'PM' } })

      await waitFor(() => {
        expect(onChange).toHaveBeenCalled()
      })
    })

    it('calls onChange when end date changes', async () => {
      const onChange = vi.fn()
      render(<DateRangeCadencePicker onChange={onChange} value="R/2024-01-15T10:00:00Z/P1D" />)

      const endDate = screen.getByLabelText('End date')
      fireEvent.change(endDate, { target: { value: '2024-12-31' } })

      await waitFor(() => {
        expect(onChange).toHaveBeenCalled()
        const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
        expect(lastCall).toContain('2024-12-31')
      })
    })
  })

  describe('input validation', () => {
    it('clamps hour to valid range (1-12)', async () => {
      render(<DateRangeCadencePicker value="R/2024-01-15T10:00:00Z/P1D" />)

      const hourInput = screen.getByLabelText('Hour')

      // Enter invalid high value
      fireEvent.change(hourInput, { target: { value: '15' } })

      // Should be clamped to 12
      await waitFor(() => {
        expect(hourInput).toHaveValue(12)
      })
    })

    it('clamps minute to valid range (0-59)', async () => {
      render(<DateRangeCadencePicker value="R/2024-01-15T10:00:00Z/P1D" />)

      const minuteInput = screen.getByLabelText('Minute')

      // Enter invalid high value
      fireEvent.change(minuteInput, { target: { value: '75' } })

      // Should be clamped to 59
      await waitFor(() => {
        expect(minuteInput).toHaveValue(59)
      })
    })
  })

  describe('output format', () => {
    it('generates correct ISO 8601 format for daily cadence', async () => {
      const onChange = vi.fn()
      render(<DateRangeCadencePicker onChange={onChange} />)

      // Set start date
      const startDate = screen.getByLabelText('Start date')
      fireEvent.change(startDate, { target: { value: '2024-06-15' } })

      // Set cadence to daily
      const cadenceSelect = screen.getByLabelText('Cadence')
      fireEvent.change(cadenceSelect, { target: { value: 'daily' } })

      await waitFor(() => {
        expect(onChange).toHaveBeenCalled()
        const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
        expect(lastCall).toMatch(/^R\/.*\/P1D/)
      })
    })

    it('generates correct format with end date', async () => {
      const onChange = vi.fn()
      render(<DateRangeCadencePicker onChange={onChange} value="R/2024-01-15T10:00:00Z/P1D" />)

      const endDate = screen.getByLabelText('End date')
      fireEvent.change(endDate, { target: { value: '2024-12-31' } })

      await waitFor(() => {
        const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
        expect(lastCall).toMatch(/\/P1D\/.*2024-12-31/)
      })
    })

    it('uses monthly duration P1M', async () => {
      const onChange = vi.fn()
      render(<DateRangeCadencePicker onChange={onChange} value="R/2024-01-15T10:00:00Z/P1D" />)

      const cadenceSelect = screen.getByLabelText('Cadence')
      fireEvent.change(cadenceSelect, { target: { value: 'monthly' } })

      await waitFor(() => {
        const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
        expect(lastCall).toContain('P1M')
      })
    })

    it('uses annual duration P1Y', async () => {
      const onChange = vi.fn()
      render(<DateRangeCadencePicker onChange={onChange} value="R/2024-01-15T10:00:00Z/P1D" />)

      const cadenceSelect = screen.getByLabelText('Cadence')
      fireEvent.change(cadenceSelect, { target: { value: 'annually' } })

      await waitFor(() => {
        const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
        expect(lastCall).toContain('P1Y')
      })
    })
  })

  describe('external value updates', () => {
    it('updates state when value prop changes externally', async () => {
      const { rerender } = render(<DateRangeCadencePicker value="R/2024-01-15T10:00:00Z/P1D" />)

      expect(screen.getByLabelText('Start date')).toHaveValue('2024-01-15')
      expect(screen.getByLabelText('Cadence')).toHaveValue('daily')

      // Rerender with new value
      rerender(<DateRangeCadencePicker value="R/2024-06-01T14:30:00Z/P1M" />)

      await waitFor(() => {
        expect(screen.getByLabelText('Start date')).toHaveValue('2024-06-01')
        expect(screen.getByLabelText('Cadence')).toHaveValue('monthly')
      })
    })
  })

  describe('helper text', () => {
    it('shows helper text for end date field', () => {
      render(<DateRangeCadencePicker />)

      expect(
        screen.getByText('If this field is left empty, the schedule will not have an end date.')
      ).toBeInTheDocument()
    })
  })
})
