import { TriggerTypeEnum } from '@ansible/nexus-contracts'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import * as TriggerNodeFormModule from '../node-forms/TriggerNodeForm'
import type { Trigger } from '../utils/workflowToGraph'

import { TriggerNodeDetails } from './TriggerNodeDetails'

// Mock the workflow store
const mockUpdateTrigger = vi.fn()
vi.mock('../../../stores/useWorkflowStore', () => ({
  useWorkflowStore: vi.fn((selector?: (store: { updateTrigger: typeof mockUpdateTrigger }) => unknown) => {
    const store = {
      updateTrigger: mockUpdateTrigger,
    }
    return selector ? selector(store) : store
  }),
  useWorkflowStoreActions: vi.fn(() => ({
    updateTrigger: mockUpdateTrigger,
  })),
  createManualTrigger: vi.fn((_requiresApproval?: boolean, name?: string) => ({
    id: 'manual_trigger',
    type: 'manual_trigger',
    name: name ?? 'Manual Trigger',
    config: {},
  })),
  createScheduledTrigger: vi.fn(
    (scheduleType: 'interval' | 'continuous', options?: { interval?: string }, name?: string) => ({
      id: 'scheduled_trigger',
      type: 'scheduled',
      name: name ?? 'Scheduled Trigger',
      config: {
        schedule_type: scheduleType,
        ...(scheduleType === 'interval' && { interval: options?.interval ?? '' }),
      },
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
        {submitButtonText ?? 'Add step'}
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
        type: 'manual_trigger' as const,
        name: 'Trigger',
        config: {},
      }

      render(<TriggerNodeDetails trigger={trigger} triggerIndex={0} onClose={mockOnClose} />)

      expect(screen.getByTestId('trigger-node-form')).toBeInTheDocument()
      expect(screen.getByTestId('initial-data')).toHaveTextContent(
        JSON.stringify({
          name: 'Trigger',
          triggerType: 'manual_trigger',
        })
      )
    })

    it('calls updateTrigger with manual trigger on form submission', async () => {
      const user = userEvent.setup()
      const trigger = {
        type: 'manual_trigger' as const,
        name: 'Trigger',
        config: {},
      }

      render(<TriggerNodeDetails trigger={trigger} triggerIndex={0} onClose={mockOnClose} />)

      await user.click(screen.getByTestId('submit-button'))

      expect(mockUpdateTrigger).toHaveBeenCalledWith(0, {
        id: 'manual_trigger',
        type: 'manual_trigger',
        name: 'Trigger',
        config: {},
      })
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Scheduled Trigger - Interval', () => {
    it('renders TriggerNodeForm with interval scheduled trigger data', () => {
      const trigger = {
        type: 'scheduled' as const,
        name: 'Trigger',
        config: {
          schedule_type: 'interval',
          interval: 'R/2024-01-01T10:00:00Z/P1D',
        },
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
        name: 'Trigger',
        config: {
          schedule_type: 'interval',
          interval: 'R/2024-01-01T10:00:00Z/P1D',
        },
      }

      render(<TriggerNodeDetails trigger={trigger} triggerIndex={1} onClose={mockOnClose} />)

      await user.click(screen.getByTestId('submit-button'))

      expect(mockUpdateTrigger).toHaveBeenCalledWith(1, {
        id: 'scheduled_trigger',
        type: 'scheduled',
        name: 'Trigger',
        config: {
          schedule_type: 'interval',
          interval: 'R/2024-01-01T10:00:00Z/P1D',
        },
      })
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Scheduled Trigger - Continuous', () => {
    it('renders TriggerNodeForm with continuous scheduled trigger data', () => {
      const trigger = {
        type: 'scheduled' as const,
        name: 'Trigger',
        config: {
          schedule_type: 'continuous',
        },
      } as unknown as Trigger

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
        name: 'Trigger',
        config: {
          schedule_type: 'continuous',
        },
      } as unknown as Trigger

      render(<TriggerNodeDetails trigger={trigger} triggerIndex={2} onClose={mockOnClose} />)

      await user.click(screen.getByTestId('submit-button'))

      expect(mockUpdateTrigger).toHaveBeenCalledWith(2, {
        id: 'scheduled_trigger',
        type: 'scheduled',
        name: 'Trigger',
        config: {
          schedule_type: 'continuous',
        },
      })
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Error Handling', () => {
    it('handles invalid trigger type gracefully', () => {
      const trigger = {
        type: 'manual_trigger' as const,
        name: 'Trigger',
        config: {},
      }

      // This test just verifies the component renders without errors
      // The actual error handling for invalid trigger types would be tested
      // through integration tests with actual form submissions
      render(<TriggerNodeDetails trigger={trigger} triggerIndex={0} onClose={mockOnClose} />)

      expect(screen.getByTestId('trigger-node-form')).toBeInTheDocument()
    })

    it('rejects invalid ISO 8601 interval format', () => {
      // Spy on the module export
      const formSpy = vi.spyOn(TriggerNodeFormModule, 'TriggerNodeForm')
      formSpy.mockImplementation(({ onSubmit }) => (
        <button
          data-testid="submit-invalid"
          onClick={() => {
            onSubmit({
              name: 'Test',
              triggerType: TriggerTypeEnum.SCHEDULED,
              scheduleType: 'interval',
              interval: 'invalid-format', // Invalid format
            })
          }}
          type="button"
        >
          Submit
        </button>
      ))

      const trigger = {
        type: 'scheduled' as const,
        name: 'Trigger',
        config: { schedule_type: 'interval', interval: 'PT1H' },
      }

      render(<TriggerNodeDetails trigger={trigger} triggerIndex={0} onClose={mockOnClose} />)

      const submitButton = screen.getByTestId('submit-invalid')
      submitButton.click()

      expect(mockShowError).toHaveBeenCalledWith({
        title: 'Update failed',
        description: expect.stringContaining('Invalid interval format') as unknown as string,
      })
      expect(mockOnClose).not.toHaveBeenCalled()

      formSpy.mockRestore()
    })

    it('rejects empty ISO 8601 duration (P or PT)', () => {
      const formSpy = vi.spyOn(TriggerNodeFormModule, 'TriggerNodeForm')
      formSpy.mockImplementation(({ onSubmit }) => (
        <button
          data-testid="submit-empty-duration"
          onClick={() => {
            onSubmit({
              name: 'Test',
              triggerType: TriggerTypeEnum.SCHEDULED,
              scheduleType: 'interval',
              interval: 'PT', // Empty duration
            })
          }}
          type="button"
        >
          Submit
        </button>
      ))

      const trigger = {
        type: 'scheduled' as const,
        name: 'Trigger',
        config: { schedule_type: 'interval', interval: 'PT1H' },
      }

      render(<TriggerNodeDetails trigger={trigger} triggerIndex={0} onClose={mockOnClose} />)

      const submitButton = screen.getByTestId('submit-empty-duration')
      submitButton.click()

      expect(mockShowError).toHaveBeenCalledWith({
        title: 'Update failed',
        description: expect.stringContaining('Invalid interval format') as unknown as string,
      })
      expect(mockOnClose).not.toHaveBeenCalled()

      formSpy.mockRestore()
    })

    it('accepts valid simple ISO 8601 duration', () => {
      const formSpy = vi.spyOn(TriggerNodeFormModule, 'TriggerNodeForm')
      formSpy.mockImplementation(({ onSubmit }) => (
        <button
          data-testid="submit-valid-duration"
          onClick={() => {
            onSubmit({
              name: 'Test',
              triggerType: TriggerTypeEnum.SCHEDULED,
              scheduleType: 'interval',
              interval: 'PT1H', // Valid simple duration
            })
          }}
          type="button"
        >
          Submit
        </button>
      ))

      const trigger = {
        type: 'scheduled' as const,
        name: 'Trigger',
        config: { schedule_type: 'interval', interval: 'PT30M' },
      }

      render(<TriggerNodeDetails trigger={trigger} triggerIndex={0} onClose={mockOnClose} />)

      const submitButton = screen.getByTestId('submit-valid-duration')
      submitButton.click()

      expect(mockShowError).not.toHaveBeenCalled()
      expect(mockOnClose).toHaveBeenCalled()

      formSpy.mockRestore()
    })

    it('accepts valid compound ISO 8601 duration', () => {
      const formSpy = vi.spyOn(TriggerNodeFormModule, 'TriggerNodeForm')
      formSpy.mockImplementation(({ onSubmit }) => (
        <button
          data-testid="submit-compound-duration"
          onClick={() => {
            onSubmit({
              name: 'Test',
              triggerType: TriggerTypeEnum.SCHEDULED,
              scheduleType: 'interval',
              interval: 'P1DT12H30M', // Valid compound duration (1 day, 12 hours, 30 minutes)
            })
          }}
          type="button"
        >
          Submit
        </button>
      ))

      const trigger = {
        type: 'scheduled' as const,
        name: 'Trigger',
        config: { schedule_type: 'interval', interval: 'PT1H' },
      }

      render(<TriggerNodeDetails trigger={trigger} triggerIndex={0} onClose={mockOnClose} />)

      const submitButton = screen.getByTestId('submit-compound-duration')
      submitButton.click()

      expect(mockShowError).not.toHaveBeenCalled()
      expect(mockOnClose).toHaveBeenCalled()

      formSpy.mockRestore()
    })

    it('rejects malformed recurring interval with invalid duration', () => {
      const formSpy = vi.spyOn(TriggerNodeFormModule, 'TriggerNodeForm')
      formSpy.mockImplementation(({ onSubmit }) => (
        <button
          data-testid="submit-malformed-recurring"
          onClick={() => {
            onSubmit({
              name: 'Test',
              triggerType: TriggerTypeEnum.SCHEDULED,
              scheduleType: 'interval',
              interval: 'R/2024-01-01T00:00:00Z/Pgarbage', // Malformed: invalid duration part
            })
          }}
          type="button"
        >
          Submit
        </button>
      ))

      const trigger = {
        type: 'scheduled' as const,
        name: 'Trigger',
        config: { schedule_type: 'interval', interval: 'PT1H' },
      }

      render(<TriggerNodeDetails trigger={trigger} triggerIndex={0} onClose={mockOnClose} />)

      const submitButton = screen.getByTestId('submit-malformed-recurring')
      submitButton.click()

      expect(mockShowError).toHaveBeenCalledWith({
        title: 'Update failed',
        description: expect.stringContaining('Invalid interval format') as unknown as string,
      })
      expect(mockOnClose).not.toHaveBeenCalled()

      formSpy.mockRestore()
    })

    it('rejects recurring interval with empty duration', () => {
      const formSpy = vi.spyOn(TriggerNodeFormModule, 'TriggerNodeForm')
      formSpy.mockImplementation(({ onSubmit }) => (
        <button
          data-testid="submit-empty-recurring-duration"
          onClick={() => {
            onSubmit({
              name: 'Test',
              triggerType: TriggerTypeEnum.SCHEDULED,
              scheduleType: 'interval',
              interval: 'R/2024-01-01T00:00:00Z/P', // Empty duration part
            })
          }}
          type="button"
        >
          Submit
        </button>
      ))

      const trigger = {
        type: 'scheduled' as const,
        name: 'Trigger',
        config: { schedule_type: 'interval', interval: 'PT1H' },
      }

      render(<TriggerNodeDetails trigger={trigger} triggerIndex={0} onClose={mockOnClose} />)

      const submitButton = screen.getByTestId('submit-empty-recurring-duration')
      submitButton.click()

      expect(mockShowError).toHaveBeenCalledWith({
        title: 'Update failed',
        description: expect.stringContaining('Invalid interval format') as unknown as string,
      })
      expect(mockOnClose).not.toHaveBeenCalled()

      formSpy.mockRestore()
    })

    it('accepts valid recurring interval with compound duration', () => {
      const formSpy = vi.spyOn(TriggerNodeFormModule, 'TriggerNodeForm')
      formSpy.mockImplementation(({ onSubmit }) => (
        <button
          data-testid="submit-valid-recurring"
          onClick={() => {
            onSubmit({
              name: 'Test',
              triggerType: TriggerTypeEnum.SCHEDULED,
              scheduleType: 'interval',
              interval: 'R/2024-01-01T00:00:00Z/P1DT12H', // Valid recurring with compound duration
            })
          }}
          type="button"
        >
          Submit
        </button>
      ))

      const trigger = {
        type: 'scheduled' as const,
        name: 'Trigger',
        config: { schedule_type: 'interval', interval: 'PT1H' },
      }

      render(<TriggerNodeDetails trigger={trigger} triggerIndex={0} onClose={mockOnClose} />)

      const submitButton = screen.getByTestId('submit-valid-recurring')
      submitButton.click()

      expect(mockShowError).not.toHaveBeenCalled()
      expect(mockOnClose).toHaveBeenCalled()

      formSpy.mockRestore()
    })

    it('accepts valid recurring ISO 8601 interval', () => {
      const formSpy = vi.spyOn(TriggerNodeFormModule, 'TriggerNodeForm')
      formSpy.mockImplementation(({ onSubmit }) => (
        <button
          data-testid="submit-valid-recurring"
          onClick={() => {
            onSubmit({
              name: 'Test',
              triggerType: TriggerTypeEnum.SCHEDULED,
              scheduleType: 'interval',
              interval: 'R/2024-01-01T10:00:00Z/P1D', // Valid recurring interval
            })
          }}
          type="button"
        >
          Submit
        </button>
      ))

      const trigger = {
        type: 'scheduled' as const,
        name: 'Trigger',
        config: { schedule_type: 'interval', interval: 'PT1H' },
      }

      render(<TriggerNodeDetails trigger={trigger} triggerIndex={0} onClose={mockOnClose} />)

      const submitButton = screen.getByTestId('submit-valid-recurring')
      submitButton.click()

      expect(mockShowError).not.toHaveBeenCalled()
      expect(mockOnClose).toHaveBeenCalled()

      formSpy.mockRestore()
    })
  })

  describe('Submit Button', () => {
    it('displays "Update trigger" as submit button text', () => {
      const trigger = {
        type: 'manual_trigger' as const,
        name: 'Trigger',
        config: {},
      }

      render(<TriggerNodeDetails trigger={trigger} triggerIndex={0} onClose={mockOnClose} />)

      expect(screen.getByText('Update trigger')).toBeInTheDocument()
    })
  })

  describe('Default Fallback', () => {
    it('falls back to manual trigger for unsupported trigger types', () => {
      // Create an event trigger (which is not yet fully implemented)
      const trigger = {
        type: 'event' as const,
        name: 'Trigger',
      } as unknown as Trigger

      render(<TriggerNodeDetails trigger={trigger} triggerIndex={0} onClose={mockOnClose} />)

      expect(screen.getByTestId('initial-data')).toHaveTextContent(
        JSON.stringify({
          name: 'Trigger',
          triggerType: 'manual_trigger',
        })
      )
    })
  })
})
