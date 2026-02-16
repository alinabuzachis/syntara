import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement, ReactNode } from 'react'
import { cloneElement, useState } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { TriggerNodeForm } from './TriggerNodeForm'

function renderWithHeader(ui: ReactElement) {
  function Wrapper() {
    const [headerContent, setHeaderContent] = useState<ReactNode | null>(null)
    return (
      <>
        {headerContent}
        {cloneElement(ui as ReactElement<{ onHeaderContentChange?: (content: ReactNode | null) => void }>, {
          onHeaderContentChange: setHeaderContent,
        })}
      </>
    )
  }

  render(<Wrapper />)
}

// Mock DateRangeCadencePicker
vi.mock('../../../components/forms/DateRangeCadencePicker', () => ({
  DateRangeCadencePicker: ({
    value,
    onChange,
  }: {
    value: string
    onChange: (value: string) => void
    required?: boolean
    showTime?: boolean
  }) => (
    <div data-testid="date-range-cadence-picker">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid="interval-input"
        placeholder="Enter interval"
      />
    </div>
  ),
}))

describe('TriggerNodeForm Component', () => {
  const mockOnSubmit = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Manual Trigger', () => {
    it('renders manual trigger form by default', () => {
      renderWithHeader(<TriggerNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

      expect(screen.queryByLabelText('Trigger type')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Requires Approval')).not.toBeInTheDocument()
    })

    it('submits manual trigger', async () => {
      const user = userEvent.setup()
      renderWithHeader(<TriggerNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

      await user.click(screen.getByRole('button', { name: 'Add node' }))

      expect(mockOnSubmit).toHaveBeenCalledWith({
        name: '',
        triggerType: 'manual',
        scheduleType: undefined,
        interval: undefined,
      })
    })

    it('renders with initial manual trigger data', () => {
      const initialData = {
        triggerType: 'manual',
      }

      renderWithHeader(<TriggerNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} initialData={initialData} />)

      expect(screen.queryByLabelText('Trigger type')).not.toBeInTheDocument()
    })
  })

  describe('Scheduled Trigger', () => {
    it('shows schedule options when scheduled trigger is selected', async () => {
      renderWithHeader(
        <TriggerNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} initialData={{ triggerType: 'scheduled' }} />
      )

      expect(screen.getByLabelText('Schedule type')).toBeInTheDocument()
      expect(screen.getByLabelText('Schedule type')).toHaveValue('interval')
    })

    it('shows interval picker for interval schedule type', async () => {
      renderWithHeader(
        <TriggerNodeForm
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          initialData={{ triggerType: 'scheduled', scheduleType: 'interval' }}
        />
      )

      expect(screen.getByTestId('date-range-cadence-picker')).toBeInTheDocument()
    })

    it('hides interval picker for continuous schedule type', async () => {
      renderWithHeader(
        <TriggerNodeForm
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          initialData={{ triggerType: 'scheduled', scheduleType: 'continuous' }}
        />
      )

      expect(screen.queryByTestId('date-range-cadence-picker')).not.toBeInTheDocument()
    })

    it('toggles interval picker when schedule type changes', async () => {
      const user = userEvent.setup()
      renderWithHeader(
        <TriggerNodeForm
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          initialData={{ triggerType: 'scheduled', scheduleType: 'interval' }}
        />
      )

      expect(screen.getByTestId('date-range-cadence-picker')).toBeInTheDocument()

      await user.selectOptions(screen.getByLabelText('Schedule type'), 'continuous')
      expect(screen.queryByTestId('date-range-cadence-picker')).not.toBeInTheDocument()

      await user.selectOptions(screen.getByLabelText('Schedule type'), 'interval')
      expect(screen.getByTestId('date-range-cadence-picker')).toBeInTheDocument()
    })

    it('submits scheduled trigger with interval', async () => {
      const user = userEvent.setup()
      renderWithHeader(
        <TriggerNodeForm
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          initialData={{ triggerType: 'scheduled', scheduleType: 'interval' }}
        />
      )

      await user.type(screen.getByTestId('interval-input'), 'R/2024-01-01T10:00:00Z/P1D')
      await user.click(screen.getByRole('button', { name: 'Add node' }))

      expect(mockOnSubmit).toHaveBeenCalledWith({
        name: '',
        triggerType: 'scheduled',
        scheduleType: 'interval',
        interval: 'R/2024-01-01T10:00:00Z/P1D',
      })
    })

    it('submits scheduled trigger with continuous schedule', async () => {
      const user = userEvent.setup()
      renderWithHeader(
        <TriggerNodeForm
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          initialData={{ triggerType: 'scheduled', scheduleType: 'continuous' }}
        />
      )

      await user.click(screen.getByRole('button', { name: 'Add node' }))

      expect(mockOnSubmit).toHaveBeenCalledWith({
        name: '',
        triggerType: 'scheduled',
        scheduleType: 'continuous',
        interval: undefined,
      })
    })

    it('renders with initial scheduled trigger data', () => {
      const initialData = {
        triggerType: 'scheduled',
        scheduleType: 'interval',
        interval: 'R/2024-01-01T10:00:00Z/P1D',
      }

      renderWithHeader(<TriggerNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} initialData={initialData} />)

      expect(screen.getByLabelText('Schedule type')).toHaveValue('interval')
      expect(screen.getByTestId('interval-input')).toHaveValue('R/2024-01-01T10:00:00Z/P1D')
    })
  })

  describe('Submit Button', () => {
    it('displays default submit button text', () => {
      renderWithHeader(<TriggerNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

      expect(screen.getByRole('button', { name: 'Add node' })).toBeInTheDocument()
    })

    it('displays custom submit button text when provided', () => {
      renderWithHeader(
        <TriggerNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} submitButtonText="Update trigger" />
      )

      expect(screen.getByRole('button', { name: 'Update trigger' })).toBeInTheDocument()
    })
  })

  describe('Form State', () => {
    it('does not show approval checkbox when scheduled trigger is selected', async () => {
      renderWithHeader(
        <TriggerNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} initialData={{ triggerType: 'scheduled' }} />
      )

      expect(screen.queryByLabelText('Requires Approval')).not.toBeInTheDocument()
    })
  })
})
