import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { submitForm } from '../../../test/submit-form'

import { renderWithHeader } from './test-utils/renderWithHeader'
import { TriggerNodeForm } from './TriggerNodeForm'

// Mock ExpandableCodeEditor (moved to ../components/ after refactor)
vi.mock('../components/ExpandableCodeEditor', () => ({
  ExpandableCodeEditor: ({
    code,
    onCodeChange,
    ariaLabel,
  }: {
    code: string
    onCodeChange: (value: string) => void
    ariaLabel?: string
  }) => (
    <textarea
      data-testid="json-schema-editor"
      aria-label={ariaLabel}
      value={code}
      onChange={(e) => onCodeChange(e.target.value)}
    />
  ),
}))

// Mock backendUrl
vi.mock('../../../utils/backendUrl', () => ({
  WEBHOOK_BASE_URL: 'https://example.com/api/v1/webhooks',
}))

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

async function submitTriggerForm() {
  await submitForm()
}

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

  describe('Manual Trigger — inputSchema validation', () => {
    it('shows validation error for invalid JSON in input schema', async () => {
      renderWithHeader(
        <TriggerNodeForm
          onSubmit={mockOnSubmit}
          initialData={{ triggerType: 'manual_trigger', inputSchema: 'not valid json' }}
        />
      )

      await submitTriggerForm()

      await waitFor(() => {
        expect(screen.getByText('Invalid JSON — check syntax')).toBeInTheDocument()
      })
      expect(mockOnSubmit).not.toHaveBeenCalled()
    })

    it('shows validation error when input schema is not a JSON object', async () => {
      renderWithHeader(
        <TriggerNodeForm
          onSubmit={mockOnSubmit}
          initialData={{ triggerType: 'manual_trigger', inputSchema: '"just a string"' }}
        />
      )

      await submitTriggerForm()

      await waitFor(() => {
        expect(screen.getByText('Input schema must be a JSON object')).toBeInTheDocument()
      })
      expect(mockOnSubmit).not.toHaveBeenCalled()
    })

    it('submits successfully with valid JSON object in input schema', async () => {
      renderWithHeader(
        <TriggerNodeForm
          onSubmit={mockOnSubmit}
          initialData={{ triggerType: 'manual_trigger', inputSchema: '{"type": "object"}' }}
        />
      )

      await submitTriggerForm()

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            triggerType: 'manual_trigger',
            inputSchema: '{"type": "object"}',
          })
        )
      })
    })

    it('submits successfully with empty input schema', async () => {
      renderWithHeader(<TriggerNodeForm onSubmit={mockOnSubmit} initialData={{ triggerType: 'manual_trigger' }} />)

      await submitTriggerForm()

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled()
      })
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

  describe('Webhook Trigger', () => {
    it('shows webhook path field when webhook trigger is selected', () => {
      renderWithHeader(<TriggerNodeForm onSubmit={mockOnSubmit} initialData={{ triggerType: 'webhook_trigger' }} />)

      expect(screen.getByLabelText('Webhook path')).toBeInTheDocument()
    })

    it('shows HTTP method field as disabled POST', () => {
      renderWithHeader(<TriggerNodeForm onSubmit={mockOnSubmit} initialData={{ triggerType: 'webhook_trigger' }} />)

      const httpMethodInput = screen.getByRole('textbox', { name: 'HTTP method' })
      expect(httpMethodInput).toBeInTheDocument()
      expect(httpMethodInput).toHaveValue('POST')
      expect(httpMethodInput).toBeDisabled()
    })

    it('shows URL display with base URL', () => {
      renderWithHeader(<TriggerNodeForm onSubmit={mockOnSubmit} initialData={{ triggerType: 'webhook_trigger' }} />)

      expect(screen.getByLabelText('Webhook URL')).toBeInTheDocument()
    })

    it('shows JSON schema editor', () => {
      renderWithHeader(<TriggerNodeForm onSubmit={mockOnSubmit} initialData={{ triggerType: 'webhook_trigger' }} />)

      expect(screen.getByTestId('json-schema-editor')).toBeInTheDocument()
    })

    it('submits webhook trigger with normalized path', async () => {
      const user = userEvent.setup()
      renderWithHeader(<TriggerNodeForm onSubmit={mockOnSubmit} initialData={{ triggerType: 'webhook_trigger' }} />)

      await user.type(screen.getByLabelText('Webhook path'), '/Jira-Updates')
      await submitTriggerForm()

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            triggerType: 'webhook_trigger',
            webhookPath: 'jira-updates',
          })
        )
      })
    })

    it('shows validation error for empty webhook path', async () => {
      renderWithHeader(<TriggerNodeForm onSubmit={mockOnSubmit} initialData={{ triggerType: 'webhook_trigger' }} />)

      await submitTriggerForm()

      await waitFor(() => {
        expect(screen.getByText('Webhook path is required')).toBeInTheDocument()
      })
      expect(mockOnSubmit).not.toHaveBeenCalled()
    })

    it('shows validation error for invalid webhook path characters', async () => {
      const user = userEvent.setup()
      renderWithHeader(<TriggerNodeForm onSubmit={mockOnSubmit} initialData={{ triggerType: 'webhook_trigger' }} />)

      await user.type(screen.getByLabelText('Webhook path'), 'invalid path!@#')
      await submitTriggerForm()

      await waitFor(() => {
        expect(
          screen.getByText(
            'Path must start and end with a letter or number, and contain only lowercase letters, numbers, hyphens, and underscores'
          )
        ).toBeInTheDocument()
      })
      expect(mockOnSubmit).not.toHaveBeenCalled()
    })

    it('does not show schedule fields when webhook trigger is selected', () => {
      renderWithHeader(<TriggerNodeForm onSubmit={mockOnSubmit} initialData={{ triggerType: 'webhook_trigger' }} />)

      expect(screen.queryByLabelText('Schedule type')).not.toBeInTheDocument()
      expect(screen.queryByTestId('date-range-cadence-picker')).not.toBeInTheDocument()
    })

    it('renders with initial webhook trigger data', () => {
      renderWithHeader(
        <TriggerNodeForm
          onSubmit={mockOnSubmit}
          initialData={{
            triggerType: 'webhook_trigger',
            webhookPath: 'existing-path',
            inputSchema: '{"type": "object"}',
          }}
        />
      )

      expect(screen.getByLabelText('Webhook path')).toHaveValue('existing-path')
      expect(screen.getByTestId('json-schema-editor')).toHaveValue('{"type": "object"}')
    })

    it('has no accessibility violations', async () => {
      const { container } = renderWithHeader(
        <TriggerNodeForm onSubmit={mockOnSubmit} initialData={{ triggerType: 'webhook_trigger' }} />
      )
      // Exclude aria-valid-attr-value: PF6 Tabs renders aria-controls pointing to
      // a panel ID that may not exist in the DOM when only the active tab is rendered
      const results = await axe(container, { rules: { 'aria-valid-attr-value': { enabled: false } } })
      expect(results).toHaveNoViolations()
    })
  })
})
