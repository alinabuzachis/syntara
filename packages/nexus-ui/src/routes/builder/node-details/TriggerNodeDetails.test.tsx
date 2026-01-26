import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { TriggerNodeDetails } from './TriggerNodeDetails'

// Mock the workflow store
const mockUpdateTrigger = vi.fn()
vi.mock('../../../stores/useWorkflowStore', () => ({
  useWorkflowStore: vi.fn((selector) => {
    const store = {
      updateTrigger: mockUpdateTrigger,
    }
    return selector ? selector(store) : store
  }),
  useWorkflowStoreActions: vi.fn(() => ({
    updateTrigger: mockUpdateTrigger,
  })),
  createManualTrigger: vi.fn((requiresApproval?: boolean, name?: string) => ({
    type: 'manual',
    requiresApproval: false,
    ...(name ? { name } : {}),
  })),
  createScheduledTrigger: vi.fn(
    (scheduleType: 'interval' | 'continuous', options?: { interval?: string }, name?: string) => ({
      type: 'scheduled',
      schedule:
        scheduleType === 'interval'
          ? { scheduleType: 'interval', interval: options?.interval ?? '' }
          : { scheduleType: 'continuous' },
      ...(name ? { name } : {}),
    })
  ),
}))

vi.mock('../utils/nodeNaming', () => ({
  getNodeDisplayNameForEdit: (baseName: string, requestedName?: string, currentName?: string) =>
    requestedName ?? currentName ?? baseName,
}))

// Mock the alerts hook
const mockShowError = vi.fn()
vi.mock('../../../components/alerts', () => ({
  useAlerts: vi.fn(() => ({
    showSuccess: vi.fn(),
    showError: mockShowError,
  })),
}))

// Mock TriggerNodeForm
vi.mock('../node-forms/TriggerNodeForm', () => ({
  TriggerNodeForm: ({
    initialData,
    onSubmit,
    onCancel,
    submitButtonText,
  }: {
    initialData?: Record<string, unknown>
    onSubmit: (data: Record<string, unknown>) => void
    onCancel: () => void
    submitButtonText?: string
  }) => (
    <div data-testid="trigger-node-form">
      <div data-testid="initial-data">{JSON.stringify(initialData)}</div>
      <button onClick={() => onSubmit(initialData ?? {})} data-testid="submit-button">
        {submitButtonText || 'Add node'}
      </button>
      <button onClick={onCancel} data-testid="cancel-button">
        Cancel
      </button>
    </div>
  ),
}))

describe('TriggerNodeDetails Component', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Manual Trigger', () => {
    it('renders TriggerNodeForm with manual trigger data', () => {
      const trigger = {
        type: 'manual' as const,
        requiresApproval: false,
        name: 'Trigger',
      }

      render(<TriggerNodeDetails trigger={trigger} triggerIndex={0} onClose={mockOnClose} />)

      expect(screen.getByTestId('trigger-node-form')).toBeInTheDocument()
      expect(screen.getByTestId('initial-data')).toHaveTextContent(
        JSON.stringify({
          name: 'Trigger',
          triggerType: 'manual',
        })
      )
    })

    it('calls updateTrigger with manual trigger on form submission', async () => {
      const user = userEvent.setup()
      const trigger = {
        type: 'manual' as const,
        requiresApproval: false,
        name: 'Trigger',
      }

      render(<TriggerNodeDetails trigger={trigger} triggerIndex={0} onClose={mockOnClose} />)

      await user.click(screen.getByTestId('submit-button'))

      expect(mockUpdateTrigger).toHaveBeenCalledWith(0, {
        type: 'manual',
        requiresApproval: false,
        name: 'Trigger',
      })
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Scheduled Trigger - Interval', () => {
    it('renders TriggerNodeForm with interval scheduled trigger data', () => {
      const trigger = {
        type: 'scheduled' as const,
        schedule: {
          scheduleType: 'interval' as const,
          interval: 'R/2024-01-01T10:00:00Z/P1D',
        },
        name: 'Trigger',
      }

      render(<TriggerNodeDetails trigger={trigger} triggerIndex={0} onClose={mockOnClose} />)

      expect(screen.getByTestId('initial-data')).toHaveTextContent(
        JSON.stringify({
          name: 'Trigger',
          triggerType: 'scheduled',
          scheduleType: 'interval',
          interval: 'R/2024-01-01T10:00:00Z/P1D',
        })
      )
    })

    it('calls updateTrigger with interval scheduled trigger on form submission', async () => {
      const user = userEvent.setup()
      const trigger = {
        type: 'scheduled' as const,
        schedule: {
          scheduleType: 'interval' as const,
          interval: 'R/2024-01-01T10:00:00Z/P1D',
        },
        name: 'Trigger',
      }

      render(<TriggerNodeDetails trigger={trigger} triggerIndex={1} onClose={mockOnClose} />)

      await user.click(screen.getByTestId('submit-button'))

      expect(mockUpdateTrigger).toHaveBeenCalledWith(1, {
        type: 'scheduled',
        schedule: {
          scheduleType: 'interval',
          interval: 'R/2024-01-01T10:00:00Z/P1D',
        },
        name: 'Trigger',
      })
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Scheduled Trigger - Continuous', () => {
    it('renders TriggerNodeForm with continuous scheduled trigger data', () => {
      const trigger = {
        type: 'scheduled' as const,
        schedule: {
          scheduleType: 'continuous' as const,
        },
        name: 'Trigger',
      }

      render(<TriggerNodeDetails trigger={trigger} triggerIndex={0} onClose={mockOnClose} />)

      expect(screen.getByTestId('initial-data')).toHaveTextContent(
        JSON.stringify({
          name: 'Trigger',
          triggerType: 'scheduled',
          scheduleType: 'continuous',
        })
      )
    })

    it('calls updateTrigger with continuous scheduled trigger on form submission', async () => {
      const user = userEvent.setup()
      const trigger = {
        type: 'scheduled' as const,
        schedule: {
          scheduleType: 'continuous' as const,
        },
        name: 'Trigger',
      }

      render(<TriggerNodeDetails trigger={trigger} triggerIndex={2} onClose={mockOnClose} />)

      await user.click(screen.getByTestId('submit-button'))

      expect(mockUpdateTrigger).toHaveBeenCalledWith(2, {
        type: 'scheduled',
        schedule: {
          scheduleType: 'continuous',
        },
        name: 'Trigger',
      })
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Error Handling', () => {
    it('handles invalid trigger type gracefully', () => {
      const trigger = {
        type: 'manual' as const,
        requiresApproval: false,
        name: 'Trigger',
      }

      // This test just verifies the component renders without errors
      // The actual error handling for invalid trigger types would be tested
      // through integration tests with actual form submissions
      render(<TriggerNodeDetails trigger={trigger} triggerIndex={0} onClose={mockOnClose} />)

      expect(screen.getByTestId('trigger-node-form')).toBeInTheDocument()
    })
  })

  describe('Submit Button', () => {
    it('displays "Update trigger" as submit button text', () => {
      const trigger = {
        type: 'manual' as const,
        requiresApproval: false,
        name: 'Trigger',
      }

      render(<TriggerNodeDetails trigger={trigger} triggerIndex={0} onClose={mockOnClose} />)

      expect(screen.getByText('Update trigger')).toBeInTheDocument()
    })
  })

  describe('Cancel Functionality', () => {
    it('calls onClose when cancel button is clicked', async () => {
      const user = userEvent.setup()
      const trigger = {
        type: 'manual' as const,
        requiresApproval: false,
        name: 'Trigger',
      }

      render(<TriggerNodeDetails trigger={trigger} triggerIndex={0} onClose={mockOnClose} />)

      await user.click(screen.getByTestId('cancel-button'))

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Default Fallback', () => {
    it('falls back to manual trigger for unsupported trigger types', () => {
      // Create an event trigger (which is not yet fully implemented)
      const trigger = {
        type: 'event' as const,
        name: 'Trigger',
      } as {
        type: 'event'
        name?: string
      }

      render(<TriggerNodeDetails trigger={trigger} triggerIndex={0} onClose={mockOnClose} />)

      expect(screen.getByTestId('initial-data')).toHaveTextContent(
        JSON.stringify({
          name: 'Trigger',
          triggerType: 'manual',
        })
      )
    })
  })
})
