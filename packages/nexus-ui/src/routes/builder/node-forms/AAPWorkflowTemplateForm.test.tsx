// IMPORTANT: vi.mock() calls are hoisted by Vitest and execute before imports
// Import order: @testing-library/react, @testing-library/user-event, then vitest
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

// Create a controllable mock function for useAAPBrowser
const mockUseAAPBrowser = vi.fn()

// Mock useAAPBrowser hook BEFORE importing components that use it
vi.mock('../../../hooks/useAAPBrowser', () => ({
  useAAPBrowser: (...args: unknown[]) =>
    mockUseAAPBrowser(...args) as ReturnType<typeof import('../../../hooks/useAAPBrowser').useAAPBrowser>,
}))

// Mock credentials client for CredentialSelector
vi.mock('../../../client', () => ({
  credentialsClient: {
    useQuery: vi.fn(() => ({
      data: {
        resources: [
          {
            id: 'test-credential-id',
            name: 'Test AAP Credential',
            credential_type: 'ansible-automation-platform',
            description: 'Test credential for AAP',
          },
        ],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })),
    useMutation: vi.fn(),
  },
}))

// Mock CredentialFormModal
vi.mock('../../../routes/configuration/credentials/form/CredentialFormModal', () => ({
  CredentialFormModal: () => null,
}))

// Mock ExpandableCodeEditor to use a simple textarea for testing
vi.mock('../../../components/ExpandableCodeEditor', () => ({
  ExpandableCodeEditor: ({
    code,
    onCodeChange,
    onBlur,
    ariaLabel,
  }: {
    code: string
    onCodeChange: (code: string) => void
    onBlur?: (value: string) => void
    ariaLabel?: string
  }) => (
    <textarea
      data-testid="extra-vars-editor"
      id="aap-wf-extraVars"
      value={code}
      onChange={(e) => onCodeChange(e.target.value)}
      onBlur={(e) => onBlur?.(e.currentTarget.value)}
      placeholder='{"version": "1.0", "environment": "prod"}'
      aria-label={ariaLabel}
    />
  ),
}))

import { credentialsClient } from '../../../client'
import type { AAPWorkflowTemplateDetail } from '../../../hooks/useAAPBrowser'

import { AAPWorkflowTemplateForm } from './AAPWorkflowTemplateForm'
import { renderWithHeader } from './test-utils/renderWithHeader'

// Mock useAAPBrowser hook to provide test data without real API calls
const mockRetryAll = vi.fn()

const defaultWorkflowTemplateDetail: AAPWorkflowTemplateDetail = {
  id: 20,
  name: 'Deploy Workflow',
  description: 'Deploy application workflow',
  ask_inventory_on_launch: false,
  ask_variables_on_launch: true,
  ask_limit_on_launch: true,
  ask_scm_branch_on_launch: true,
  ask_labels_on_launch: false,
  ask_tags_on_launch: true,
  ask_skip_tags_on_launch: true,
  survey_enabled: false,
  url: 'https://aap.example.com/execution/templates/workflow-job-template/20/details',
  // Default values from template configuration
  default_inventory: { id: 1, name: 'Demo Inventory' },
  default_labels: [],
}

// Base mock data shared across all tests (static data that doesn't change)
const baseMockAAPBrowserData = {
  organizations: [
    { id: 1, name: 'Default' },
    { id: 2, name: 'Engineering' },
  ],
  workflowTemplates: [
    { id: 20, name: 'Deploy Workflow', description: 'Deploy application workflow', organization_name: 'Default' },
    { id: 21, name: 'Backup Workflow', description: 'Backup database workflow', organization_name: 'Default' },
  ],
  inventories: [{ id: 1, name: 'Demo Inventory', description: 'Demo hosts', organization_name: 'Default' }],
  labels: [],
  selectedOrg: '',
  selectOrganization: vi.fn(),
  selectTemplate: vi.fn(),
  resetAll: vi.fn(),
  loadingOrgs: false,
  loadingTemplates: false,
  loadingInventories: false,
  loadingLabels: false,
  loadingTemplateDetail: false,
  workflowTemplateDetail: undefined,
  error: null,
  retryAll: mockRetryAll,
  searchOrganizations: vi.fn(),
  searchTemplates: vi.fn(),
  searchInventories: vi.fn(),
  searchLabels: vi.fn(),
}

// Helper function to create mock return value with a specific workflow template detail
function createMockAAPBrowser(workflowTemplateDetail: AAPWorkflowTemplateDetail) {
  return {
    ...baseMockAAPBrowserData,
    workflowTemplateDetail,
  }
}

describe('AAPWorkflowTemplateForm', () => {
  const mockOnSubmit = vi.fn()

  beforeEach(() => {
    mockUseAAPBrowser.mockClear()
    mockOnSubmit.mockClear()
    // Set default mock implementation (can be overridden in nested describe blocks)
    mockUseAAPBrowser.mockReturnValue(createMockAAPBrowser(defaultWorkflowTemplateDetail))

    // Reset credentials client to default mock
    vi.mocked(credentialsClient.useQuery).mockReturnValue({
      data: {
        resources: [
          {
            id: 'test-credential-id',
            name: 'Test AAP Credential',
            credential_type: 'ansible-automation-platform',
            description: 'Test credential for AAP',
          },
        ],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never)
  })

  it('renders form with required fields', () => {
    renderWithHeader(<AAPWorkflowTemplateForm onSubmit={mockOnSubmit} onCancel={vi.fn()} />)

    expect(screen.getByLabelText(/Name/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Select an organization/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Select a workflow template/i)).toBeInTheDocument()
    // CredentialSelector renders with a select placeholder
    expect(screen.getByText(/Select credential/i)).toBeInTheDocument()
  })

  it('renders credential selector', () => {
    renderWithHeader(<AAPWorkflowTemplateForm onSubmit={mockOnSubmit} onCancel={vi.fn()} />)

    // CredentialSelector renders a select with placeholder text
    expect(screen.getByText(/Select credential/i)).toBeInTheDocument()
  })

  it('renders workflow template typeahead even when no organization is selected', () => {
    renderWithHeader(<AAPWorkflowTemplateForm onSubmit={mockOnSubmit} onCancel={vi.fn()} />)

    const templateInput = screen.getByPlaceholderText(/Select a workflow template/i)
    expect(templateInput).toBeInTheDocument()
  })

  it('validates required organization field', async () => {
    const user = userEvent.setup()
    renderWithHeader(<AAPWorkflowTemplateForm onSubmit={mockOnSubmit} onCancel={vi.fn()} />)

    await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Test Workflow')

    // Submit form programmatically (submit button is in parent NodeEditorLayout, not rendered in this test)
    const form = screen.getByRole<HTMLFormElement>('form')
    form.requestSubmit()

    await waitFor(() => {
      expect(mockOnSubmit).not.toHaveBeenCalled()
    })
  })

  it('populates form with initial data', () => {
    renderWithHeader(
      <AAPWorkflowTemplateForm
        onSubmit={mockOnSubmit}
        onCancel={vi.fn()}
        initialData={{
          name: 'Existing Workflow',
          organization_name: 'Default',
          workflow_job_template_name: 'Deploy Workflow',
          workflow_job_template_id: 20,
          limit: 'webservers',
        }}
      />
    )

    expect(screen.getByDisplayValue('Existing Workflow')).toBeInTheDocument()
    // Typeahead shows selected value in the input when closed
    expect(screen.getByDisplayValue('Default')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Deploy Workflow')).toBeInTheDocument()
  })

  it('passes projectId to CredentialSelector', () => {
    const useQueryMock = vi.mocked(credentialsClient.useQuery)
    useQueryMock.mockClear()

    renderWithHeader(
      <AAPWorkflowTemplateForm
        onSubmit={mockOnSubmit}
        onCancel={vi.fn()}
        onHeaderContentChange={vi.fn()}
        projectId="project-456"
      />
    )

    const hasProjectIdCall = useQueryMock.mock.calls.some((call) => {
      const params = (call[2] as unknown as { params?: { query?: Record<string, unknown> } })?.params?.query
      return params?.project_id === 'project-456'
    })
    expect(hasProjectIdCall).toBe(true)
  })

  it('renders prompt on launch fields based on workflow template detail flags', () => {
    renderWithHeader(<AAPWorkflowTemplateForm onSubmit={mockOnSubmit} onCancel={vi.fn()} />)

    // Fields enabled in defaultWorkflowTemplateDetail should be visible
    expect(screen.getByLabelText(/Extra Variables/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Limit/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Source control branch/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Job tags/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Skip tags/i)).toBeInTheDocument()

    // Fields disabled in defaultWorkflowTemplateDetail should NOT be visible
    expect(screen.queryByPlaceholderText(/Use default inventory/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Labels/i)).not.toBeInTheDocument()
  })

  it('validates extra vars JSON format', async () => {
    const user = userEvent.setup()
    renderWithHeader(
      <AAPWorkflowTemplateForm
        onSubmit={mockOnSubmit}
        onCancel={vi.fn()}
        initialData={{
          organization_name: 'Default',
          workflow_job_template_name: 'Deploy Workflow',
          workflow_job_template_id: 20,
        }}
      />
    )

    const extraVarsInput = screen.getByPlaceholderText(/version/i)
    await user.click(extraVarsInput)
    await user.paste('invalid json')

    // Submit form programmatically (submit button is in parent NodeEditorLayout, not rendered in this test)
    const form = screen.getByRole<HTMLFormElement>('form')
    form.requestSubmit()

    await waitFor(() => {
      expect(mockOnSubmit).not.toHaveBeenCalled()
    })
  })

  it('renders form with all prompt-on-launch initial values', () => {
    // Renders form with comprehensive initial data to exercise code paths
    renderWithHeader(
      <AAPWorkflowTemplateForm
        onSubmit={mockOnSubmit}
        onCancel={vi.fn()}
        initialData={{
          organization_name: 'Default',
          workflow_job_template_name: 'Deploy Workflow',
          workflow_job_template_id: 20,
          inventory_name: 'Production',
          inventory_id: 1,
          extra_vars: '{"key": "value"}',
          limit: 'host1',
          scm_branch: 'main',
          tags: 'deploy',
          skip_tags: 'debug',
          labels: ['prod'],
        }}
      />
    )

    // Verify form rendered with organization and template
    expect(screen.getByPlaceholderText(/Select an organization/i)).toHaveValue('Default')
    expect(screen.getByPlaceholderText(/Select a workflow template/i)).toHaveValue('Deploy Workflow')
  })

  it('clears downstream values when organization changes', async () => {
    const user = userEvent.setup()
    renderWithHeader(
      <AAPWorkflowTemplateForm
        onSubmit={mockOnSubmit}
        onCancel={vi.fn()}
        initialData={{
          organization_name: 'Default',
          workflow_job_template_name: 'Deploy Workflow',
          workflow_job_template_id: 20,
          name: 'Test Step',
        }}
      />
    )

    // Click the organization field to open dropdown
    const orgInput = screen.getByPlaceholderText(/Select an organization/i)
    await user.click(orgInput)

    // Find and click an organization option from the dropdown
    const engineeringOption = await screen.findByText('Engineering')
    await user.click(engineeringOption)

    // Verify organization changed and template was cleared
    await waitFor(() => {
      expect(orgInput).toHaveValue('Engineering')
    })

    const templateInput = screen.getByPlaceholderText(/Select a workflow template/i)
    expect(templateInput).toHaveValue('')
  })

  it('clears downstream values when template changes', async () => {
    const user = userEvent.setup()
    renderWithHeader(
      <AAPWorkflowTemplateForm
        onSubmit={mockOnSubmit}
        onCancel={vi.fn()}
        initialData={{
          organization_name: 'Default',
          workflow_job_template_name: 'Deploy Workflow',
          workflow_job_template_id: 20,
          name: 'Test Step',
        }}
      />
    )

    // Click the template field to open dropdown
    const templateInput = screen.getByPlaceholderText(/Select a workflow template/i)
    await user.click(templateInput)

    // Find and click a template option from the dropdown
    const backupOption = await screen.findByText('Backup Workflow')
    await user.click(backupOption)

    // Verify template changed (the onChange handler clears prompt-on-launch fields internally)
    await waitFor(() => {
      expect(templateInput).toHaveValue('Backup Workflow')
    })
  })

  it('has no accessibility violations', async () => {
    const { container } = renderWithHeader(<AAPWorkflowTemplateForm onSubmit={mockOnSubmit} onCancel={vi.fn()} />)

    // Wait for PF6 Tabs async state updates to settle before running axe
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /parameters/i })).toBeInTheDocument()
    })

    const results = await axe(container, {
      rules: {
        // PF6 Tabs renders aria-controls before the tab panel is mounted;
        // this is a known PatternFly timing issue, not an app-level bug.
        'aria-valid-attr-value': { enabled: false },
      },
    })
    expect(results).toHaveNoViolations()
  })

  describe('Default value pre-population', () => {
    // Template configuration for this test suite
    const templateWithPrompts: AAPWorkflowTemplateDetail = {
      ...defaultWorkflowTemplateDetail,
      ask_inventory_on_launch: true,
      ask_labels_on_launch: true,
    }

    beforeEach(() => {
      // Use template with prompt flags enabled for these tests
      mockUseAAPBrowser.mockReturnValue(createMockAAPBrowser(templateWithPrompts))
    })

    it('handles workflow template with no default values gracefully', async () => {
      // Create a template with no defaults (overrides the beforeEach mock for this test)
      const templateWithNoDefaults: AAPWorkflowTemplateDetail = {
        ...templateWithPrompts,
        default_inventory: null,
        default_labels: [],
      }
      mockUseAAPBrowser.mockReturnValue(createMockAAPBrowser(templateWithNoDefaults))

      renderWithHeader(
        <AAPWorkflowTemplateForm
          onSubmit={mockOnSubmit}
          onCancel={vi.fn()}
          initialData={{
            organization_name: 'Default',
            workflow_job_template_name: 'Deploy Workflow',
            workflow_job_template_id: 20,
          }}
        />
      )

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /parameters/i })).toBeInTheDocument()
      })

      // Should show "No default" placeholders
      expect(screen.getByPlaceholderText(/No default inventory/i)).toBeInTheDocument()
    })
  })

  describe('Form Submission', () => {
    it('submits form with pre-filled required fields', async () => {
      renderWithHeader(
        <AAPWorkflowTemplateForm
          onSubmit={mockOnSubmit}
          onCancel={vi.fn()}
          initialData={{
            name: 'Test Workflow',
            organization_name: 'Default',
            workflow_job_template_name: 'Deploy Workflow',
            workflow_job_template_id: 20,
          }}
        />
      )

      // Submit form programmatically (submit button is in parent NodeEditorLayout, not rendered in this test)
      const form = screen.getByRole<HTMLFormElement>('form')
      form.requestSubmit()

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Test Workflow',
            organization_name: 'Default',
            workflow_job_template_name: 'Deploy Workflow',
            workflow_job_template_id: 20,
          })
        )
      })
    })
  })

  describe('Expression Mode', () => {
    it('toggles expression mode switch', async () => {
      const user = userEvent.setup()
      renderWithHeader(<AAPWorkflowTemplateForm onSubmit={mockOnSubmit} onCancel={vi.fn()} />)

      const expressionSwitch = screen.getByLabelText(/Use expressions/i)
      expect(expressionSwitch).not.toBeChecked()

      await user.click(expressionSwitch)

      expect(expressionSwitch).toBeChecked()
    })

    it('shows expression text fields when expression mode is enabled', async () => {
      const user = userEvent.setup()
      renderWithHeader(<AAPWorkflowTemplateForm onSubmit={mockOnSubmit} onCancel={vi.fn()} />)

      const expressionSwitch = screen.getByLabelText(/Use expressions/i)
      await user.click(expressionSwitch)

      // Expression mode fields should appear
      expect(screen.getByPlaceholderText(/org name or drag expression/i)).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/template name or drag expression/i)).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/inventory name or drag expression/i)).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/branch name or drag expression/i)).toBeInTheDocument()
    })

    it('auto-detects expression mode from initial data', () => {
      renderWithHeader(
        <AAPWorkflowTemplateForm
          onSubmit={mockOnSubmit}
          onCancel={vi.fn()}
          initialData={{
            organization_name: '${workflow.context.org}',
            workflow_job_template_name: 'Deploy Workflow',
          }}
        />
      )

      const expressionSwitch = screen.getByLabelText(/Use expressions/i)
      expect(expressionSwitch).toBeChecked()
    })
  })
})
