import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DateRangeCadencePicker } from './DateRangeCadencePicker'

async function selectCadence(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole('button', { name: 'Cadence' }))
  await user.click(screen.getByRole('option', { name: label }))
}

async function selectPeriod(user: ReturnType<typeof userEvent.setup>, label: 'AM' | 'PM') {
  await user.click(screen.getByRole('button', { name: 'Period' }))
  await user.click(screen.getByRole('option', { name: label }))
}

describe('DateRangeCadencePicker', () => {
  describe('rendering', () => {
    it('renders all form fields', () => {
      render(<DateRangeCadencePicker />)

      expect(screen.getByLabelText('Start date')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cadence' })).toBeInTheDocument()
      expect(screen.getByLabelText('Hour')).toBeInTheDocument()
      expect(screen.getByLabelText('Minute')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Period' })).toBeInTheDocument()
      expect(screen.getByLabelText('End date')).toBeInTheDocument()
    })

    it('renders cadence options', async () => {
      const user = userEvent.setup()
      render(<DateRangeCadencePicker />)

      await user.click(screen.getByRole('button', { name: 'Cadence' }))

      expect(screen.getByRole('option', { name: 'Does not repeat' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Daily' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Weekly' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Monthly' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Annually' })).toBeInTheDocument()
    })

    it('renders time period options', async () => {
      const user = userEvent.setup()
      render(<DateRangeCadencePicker />)

      await user.click(screen.getByRole('button', { name: 'Period' }))

      expect(screen.getByRole('option', { name: 'AM' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'PM' })).toBeInTheDocument()
    })

    it('hides time inputs when showTime is false', () => {
      render(<DateRangeCadencePicker showTime={false} />)

      expect(screen.queryByLabelText('Hour')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Minute')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Period' })).not.toBeInTheDocument()
    })

    it('shows time inputs by default', () => {
      render(<DateRangeCadencePicker />)

      expect(screen.getByLabelText('Hour')).toBeInTheDocument()
      expect(screen.getByLabelText('Minute')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Period' })).toBeInTheDocument()
    })

    it('passes required prop to form groups', () => {
      render(<DateRangeCadencePicker required />)

      expect(screen.getByLabelText('Start date')).toHaveAttribute('aria-required', 'true')
      expect(screen.getByRole('button', { name: 'Cadence' })).toHaveAttribute('aria-required', 'true')
      expect(screen.getByLabelText('Hour')).toHaveAttribute('aria-required', 'true')
    })

    it('does not mark form groups as required when required is false', () => {
      render(<DateRangeCadencePicker />)

      expect(screen.getByLabelText('Start date')).not.toHaveAttribute('aria-required', 'true')
      expect(screen.getByRole('button', { name: 'Cadence' })).not.toHaveAttribute('aria-required', 'true')
    })

    it('applies custom className', () => {
      render(<DateRangeCadencePicker className="custom-class" />)

      expect(screen.getByTestId('date-range-cadence-picker')).toHaveClass('custom-class')
    })

    it('applies error state to start date field only when error prop is true', () => {
      render(<DateRangeCadencePicker error />)

      const startDateInput = screen.getByLabelText('Start date')
      expect(startDateInput).toHaveAttribute('aria-invalid', 'true')
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
      expect(screen.getByRole('button', { name: 'Cadence' })).toHaveTextContent('Daily')
    })

    it('parses weekly interval', () => {
      render(<DateRangeCadencePicker value="R/2024-01-15T10:00:00Z/P7D" />)

      expect(screen.getByRole('button', { name: 'Cadence' })).toHaveTextContent('Weekly')
    })

    it('parses weekly interval with P1W format', () => {
      render(<DateRangeCadencePicker value="R/2024-01-15T10:00:00Z/P1W" />)

      expect(screen.getByRole('button', { name: 'Cadence' })).toHaveTextContent('Weekly')
    })

    it('parses monthly interval', () => {
      render(<DateRangeCadencePicker value="R/2024-01-15T10:00:00Z/P1M" />)

      expect(screen.getByRole('button', { name: 'Cadence' })).toHaveTextContent('Monthly')
    })

    it('parses annually interval', () => {
      render(<DateRangeCadencePicker value="R/2024-01-15T10:00:00Z/P1Y" />)

      expect(screen.getByRole('button', { name: 'Cadence' })).toHaveTextContent('Annually')
    })

    it('parses interval with end date', () => {
      render(<DateRangeCadencePicker value="R/2024-01-15T10:00:00Z/P1D/2024-12-31T23:59:59Z" />)

      expect(screen.getByLabelText('Start date')).toHaveValue('2024-01-15')
      expect(screen.getByLabelText('End date')).toHaveValue('2024-12-31')
    })

    it('parses time from interval', () => {
      render(<DateRangeCadencePicker value="R/2024-01-15T09:30:00Z/P1D" />)

      const hourInput = screen.getByLabelText('Hour')
      const minuteInput = screen.getByLabelText('Minute')
      const periodButton = screen.getByRole('button', { name: 'Period' })

      expect(hourInput).toBeInTheDocument()
      expect(minuteInput).toBeInTheDocument()
      expect(periodButton).toBeInTheDocument()

      const hourValue = Number(hourInput.getAttribute('value'))
      expect(hourValue).toBeGreaterThanOrEqual(1)
      expect(hourValue).toBeLessThanOrEqual(12)
    })

    it('parses time and sets period', () => {
      render(<DateRangeCadencePicker value="R/2024-01-15T14:45:00Z/P1D" />)

      const periodButton = screen.getByRole('button', { name: 'Period' })
      expect(['AM', 'PM']).toContain(periodButton.textContent)
    })

    it('handles empty value', () => {
      render(<DateRangeCadencePicker value="" />)

      expect(screen.getByLabelText('Start date')).toHaveValue('')
      expect(screen.getByRole('button', { name: 'Cadence' })).toHaveTextContent('Does not repeat')
    })

    it('handles undefined value', () => {
      render(<DateRangeCadencePicker />)

      expect(screen.getByLabelText('Start date')).toHaveValue('')
      expect(screen.getByRole('button', { name: 'Cadence' })).toHaveTextContent('Does not repeat')
    })
  })

  describe('onChange callbacks', () => {
    it('calls onChange when start date changes', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn<(value: string) => void>()
      render(<DateRangeCadencePicker onChange={onChange} value="R/2024-01-15T10:00:00Z/P1D" />)

      const startDate = screen.getByLabelText('Start date')
      await user.clear(startDate)
      await user.type(startDate, '2024-02-01')

      await waitFor(() => {
        expect(onChange).toHaveBeenCalled()
        const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
        expect(lastCall).toContain('2024-02-01')
      })
    })

    it('calls onChange when cadence changes', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn<(value: string) => void>()
      render(<DateRangeCadencePicker onChange={onChange} value="R/2024-01-15T10:00:00Z/P1D" />)

      await selectCadence(user, 'Weekly')

      await waitFor(() => {
        expect(onChange).toHaveBeenCalled()
        const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
        expect(lastCall).toContain('P7D')
      })
    })

    it('calls onChange with run-once interval (R1/start/PT0S) when cadence is none and start date is set', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn<(value: string) => void>()
      render(<DateRangeCadencePicker onChange={onChange} value="R/2024-01-15T10:00:00Z/P1D" />)

      await selectCadence(user, 'Does not repeat')

      await waitFor(() => {
        expect(onChange).toHaveBeenLastCalledWith(expect.stringMatching(/^R1\/.+\/PT0S$/))
      })
    })

    it('calls onChange when hour changes', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn<(value: string) => void>()
      render(<DateRangeCadencePicker onChange={onChange} value="R/2024-01-15T10:00:00Z/P1D" />)

      const hourInput = screen.getByLabelText('Hour')
      await user.clear(hourInput)
      await user.type(hourInput, '3')

      await waitFor(() => {
        expect(onChange).toHaveBeenCalled()
      })
    })

    it('calls onChange when minute changes', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn<(value: string) => void>()
      render(<DateRangeCadencePicker onChange={onChange} value="R/2024-01-15T10:00:00Z/P1D" />)

      const minuteInput = screen.getByLabelText('Minute')
      await user.clear(minuteInput)
      await user.type(minuteInput, '45')

      await waitFor(() => {
        expect(onChange).toHaveBeenCalled()
      })
    })

    it('calls onChange when period changes', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn<(value: string) => void>()
      render(<DateRangeCadencePicker onChange={onChange} value="R/2024-01-15T10:00:00Z/P1D" />)

      await selectPeriod(user, 'PM')

      await waitFor(() => {
        expect(onChange).toHaveBeenCalled()
      })
    })

    it('calls onChange when end date changes', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn<(value: string) => void>()
      render(<DateRangeCadencePicker onChange={onChange} value="R/2024-01-15T10:00:00Z/P1D" />)

      const endDate = screen.getByLabelText('End date')
      await user.clear(endDate)
      await user.type(endDate, '2024-12-31')

      await waitFor(() => {
        expect(onChange).toHaveBeenCalled()
        const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
        expect(lastCall).toContain('2024-12-31')
      })
    })
  })

  describe('input validation', () => {
    it('clamps hour to valid range (1-12)', async () => {
      const user = userEvent.setup()
      render(<DateRangeCadencePicker value="R/2024-01-15T10:00:00Z/P1D" />)

      const hourInput = screen.getByLabelText('Hour')

      await user.clear(hourInput)
      await user.type(hourInput, '15')

      await waitFor(() => {
        expect(hourInput).toHaveValue(12)
      })
    })

    it('clamps minute to valid range (0-59)', async () => {
      const user = userEvent.setup()
      render(<DateRangeCadencePicker value="R/2024-01-15T10:00:00Z/P1D" />)

      const minuteInput = screen.getByLabelText('Minute')

      await user.clear(minuteInput)
      await user.type(minuteInput, '75')

      await waitFor(() => {
        expect(minuteInput).toHaveValue(59)
      })
    })
  })

  describe('output format', () => {
    it('generates correct ISO 8601 format for daily cadence', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn<(value: string) => void>()
      render(<DateRangeCadencePicker onChange={onChange} />)

      const startDate = screen.getByLabelText('Start date')
      await user.type(startDate, '2024-06-15')

      await selectCadence(user, 'Daily')

      await waitFor(() => {
        expect(onChange).toHaveBeenCalled()
        const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
        expect(lastCall).toMatch(/^R\/.*\/P1D/)
      })
    })

    it('generates correct format with end date', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn<(value: string) => void>()
      render(<DateRangeCadencePicker onChange={onChange} value="R/2024-01-15T10:00:00Z/P1D" />)

      const endDate = screen.getByLabelText('End date')
      await user.type(endDate, '2024-12-31')

      await waitFor(() => {
        const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
        expect(lastCall).toMatch(/\/P1D\/.*2024-12-31/)
      })
    })

    it('uses monthly duration P1M', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn<(value: string) => void>()
      render(<DateRangeCadencePicker onChange={onChange} value="R/2024-01-15T10:00:00Z/P1D" />)

      await selectCadence(user, 'Monthly')

      await waitFor(() => {
        const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
        expect(lastCall).toContain('P1M')
      })
    })

    it('uses annual duration P1Y', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn<(value: string) => void>()
      render(<DateRangeCadencePicker onChange={onChange} value="R/2024-01-15T10:00:00Z/P1D" />)

      await selectCadence(user, 'Annually')

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
      expect(screen.getByRole('button', { name: 'Cadence' })).toHaveTextContent('Daily')

      rerender(<DateRangeCadencePicker value="R/2024-06-01T14:30:00Z/P1M" />)

      await waitFor(() => {
        expect(screen.getByLabelText('Start date')).toHaveValue('2024-06-01')
        expect(screen.getByRole('button', { name: 'Cadence' })).toHaveTextContent('Monthly')
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
