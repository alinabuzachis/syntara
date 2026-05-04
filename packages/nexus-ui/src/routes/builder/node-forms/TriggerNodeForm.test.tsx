import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { renderWithHeader } from './test-utils/renderWithHeader'
import { TriggerNodeForm } from './TriggerNodeForm'

// Mock DateRangeCadencePicker
vi.mock('../../../components/forms/DateRangeCadencePicker', () => ({
  DateRangeCadencePicker: ({
    value,
    onChange,
    errorMessage,
  }: {
    value: string
    onChange: (value: string) => void
    required?: boolean
    showTime?: boolean
    errorMessage?: string
  }) => (
    <div data-testid="date-range-cadence-picker">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid="interval-input"
        placeholder="Enter interval"
      />
      {errorMessage && <span data-testid="interval-error">{errorMessage}</span>}
    </div>
  ),
}))

describe('TriggerNodeForm Component', () => {
  const mockOnSubmit = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Manual Trigger', () => {
    it('renders manual trigger form by default', () => {
      renderWithHeader(<TriggerNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.queryByLabelText('Trigger type')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Requires Approval')).not.toBeInTheDocument()
    })

    it('renders with initial manual trigger data', () => {
      const initialData = {
        triggerType: 'manual',
      }

      renderWithHeader(<TriggerNodeForm onSubmit={mockOnSubmit} initialData={initialData} />)

      expect(screen.queryByLabelText('Trigger type')).not.toBeInTheDocument()
    })
  })

  describe('Scheduled Trigger', () => {
    it('shows schedule options when scheduled trigger is selected', () => {
      renderWithHeader(<TriggerNodeForm onSubmit={mockOnSubmit} initialData={{ triggerType: 'scheduled' }} />)

      expect(screen.getByLabelText('Schedule type')).toBeInTheDocument()
      expect(screen.getByLabelText('Schedule type')).toHaveValue('interval')
    })

    it('shows interval picker for interval schedule type', () => {
      renderWithHeader(
        <TriggerNodeForm onSubmit={mockOnSubmit} initialData={{ triggerType: 'scheduled', scheduleType: 'interval' }} />
      )

      expect(screen.getByTestId('date-range-cadence-picker')).toBeInTheDocument()
    })

    it('hides interval picker for continuous schedule type', () => {
      renderWithHeader(
        <TriggerNodeForm
          onSubmit={mockOnSubmit}
          initialData={{ triggerType: 'scheduled', scheduleType: 'continuous' }}
        />
      )

      expect(screen.queryByTestId('date-range-cadence-picker')).not.toBeInTheDocument()
    })

    it('toggles interval picker when schedule type changes', async () => {
      const user = userEvent.setup()
      renderWithHeader(
        <TriggerNodeForm onSubmit={mockOnSubmit} initialData={{ triggerType: 'scheduled', scheduleType: 'interval' }} />
      )

      expect(screen.getByTestId('date-range-cadence-picker')).toBeInTheDocument()

      await user.selectOptions(screen.getByLabelText('Schedule type'), 'continuous')
      expect(screen.queryByTestId('date-range-cadence-picker')).not.toBeInTheDocument()

      await user.selectOptions(screen.getByLabelText('Schedule type'), 'interval')
      expect(screen.getByTestId('date-range-cadence-picker')).toBeInTheDocument()
    })

    it('renders with initial scheduled trigger data', () => {
      const initialData = {
        triggerType: 'scheduled',
        scheduleType: 'interval',
        interval: 'R/2024-01-01T10:00:00Z/P1D',
      }

      renderWithHeader(<TriggerNodeForm onSubmit={mockOnSubmit} initialData={initialData} />)

      expect(screen.getByLabelText('Schedule type')).toHaveValue('interval')
      expect(screen.getByTestId('interval-input')).toHaveValue('R/2024-01-01T10:00:00Z/P1D')
    })
  })

  describe('Form State', () => {
    it('does not show approval checkbox when scheduled trigger is selected', () => {
      renderWithHeader(<TriggerNodeForm onSubmit={mockOnSubmit} initialData={{ triggerType: 'scheduled' }} />)

      expect(screen.queryByLabelText('Requires Approval')).not.toBeInTheDocument()
    })
  })
})
