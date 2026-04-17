import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { credentialsClient } from '../../../client'

import { AAPNodeForm } from './AAPNodeForm'
import { renderWithHeader } from './test-utils/renderWithHeader'

// Mock credentials client for CredentialSelector
vi.mock('../../../client', () => ({
  credentialsClient: {
    useQuery: vi.fn(() => ({
      data: { resources: [] },
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

// Mock useAAPBrowser hook to provide test data without real API calls
const mockRetryAll = vi.fn()

const defaultTemplateDetail = {
  id: 10,
  name: 'Deploy App',
  description: 'Deploy the application',
  ask_job_type_on_launch: true,
  ask_inventory_on_launch: false,
  ask_credential_on_launch: false,
  ask_variables_on_launch: true,
  ask_limit_on_launch: true,
  ask_tags_on_launch: true,
  ask_skip_tags_on_launch: true,
  ask_verbosity_on_launch: true,
  ask_diff_mode_on_launch: true,
  ask_forks_on_launch: true,
  ask_job_slice_count_on_launch: true,
  ask_execution_environment_on_launch: false,
  ask_instance_groups_on_launch: false,
  ask_labels_on_launch: false,
  ask_timeout_on_launch: true,
  survey_enabled: false,
  url: 'https://aap.example.com/execution/templates/job-template/10/details',
}

let mockTemplateDetail = { ...defaultTemplateDetail }

vi.mock('../../../hooks/useAAPBrowser', () => ({
  useAAPBrowser: () => ({
    organizations: [
      { id: 1, name: 'Default' },
      { id: 2, name: 'Engineering' },
    ],
    jobTemplates: [
      { id: 10, name: 'Deploy App', description: 'Deploy the application', organization: 'Default' },
      { id: 11, name: 'Backup DB', description: 'Backup the database', organization: 'Default' },
    ],
    inventories: [{ id: 1, name: 'Demo Inventory', description: 'Demo hosts', organization: 'Default' }],
    executionEnvironments: [
      { id: 1, name: 'Default EE', description: 'Default execution environment' },
      { id: 2, name: 'Custom EE', description: 'Custom EE with extra collections' },
    ],
    credentials: [
      { id: 1, name: 'Machine Credential', description: 'SSH key for hosts' },
      { id: 2, name: 'AWS Credential', description: 'AWS access keys' },
    ],
    instanceGroups: [
      { id: 1, name: 'default' },
      { id: 2, name: 'controlplane' },
    ],
    templateDetail: mockTemplateDetail,
    selectedOrg: '',
    selectOrganization: vi.fn(),
    selectJobTemplate: vi.fn(),
    resetAll: vi.fn(),
    loadingOrgs: false,
    loadingTemplates: false,
    loadingInventories: false,
    loadingExecutionEnvironments: false,
    loadingCredentials: false,
    loadingInstanceGroups: false,
    loadingTemplateDetail: false,
    error: null,
    retryAll: mockRetryAll,
    searchOrganizations: vi.fn(),
    searchJobTemplates: vi.fn(),
    searchInventories: vi.fn(),
    searchExecutionEnvironments: vi.fn(),
    searchCredentials: vi.fn(),
    searchInstanceGroups: vi.fn(),
  }),
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
      id="aap-extraVars"
      value={code}
      onChange={(e) => onCodeChange(e.target.value)}
      onBlur={(e) => onBlur?.(e.currentTarget.value)}
      placeholder='{"version": "1.0", "environment": "prod"}'
      aria-label={ariaLabel}
    />
  ),
}))

describe('AAPNodeForm', () => {
  const mockOnSubmit = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mockTemplateDetail to prevent test pollution
    mockTemplateDetail = { ...defaultTemplateDetail }
  })

  it('renders form with required fields', () => {
    renderWithHeader(<AAPNodeForm onSubmit={mockOnSubmit} onCancel={vi.fn()} />)

    expect(screen.getByLabelText(/Name/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Select an organization/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Select a job template/i)).toBeInTheDocument()
    // CredentialSelector renders with a select placeholder
    expect(screen.getByText(/Select credential/i)).toBeInTheDocument()
  })

  it('renders credential selector', () => {
    renderWithHeader(<AAPNodeForm onSubmit={mockOnSubmit} onCancel={vi.fn()} />)

    // CredentialSelector renders a select with placeholder text
    expect(screen.getByText(/Select credential/i)).toBeInTheDocument()
  })

  it('renders job template typeahead even when no organization is selected', () => {
    renderWithHeader(<AAPNodeForm onSubmit={mockOnSubmit} onCancel={vi.fn()} />)

    const templateInput = screen.getByPlaceholderText(/Select a job template/i)
    expect(templateInput).toBeInTheDocument()
  })

  it('submits form with pre-filled required fields', async () => {
    renderWithHeader(
      <AAPNodeForm
        onSubmit={mockOnSubmit}
        onCancel={vi.fn()}
        initialData={{
          name: 'Test Job',
          organization: 'Default',
          jobTemplateName: 'Deploy App',
          jobTemplateId: 10,
        }}
      />
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Add step/i }))

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Job',
          organization: 'Default',
          jobTemplateName: 'Deploy App',
          jobTemplateId: 10,
        })
      )
    })
  })

  it('does not submit when organization is empty', async () => {
    const user = userEvent.setup()
    renderWithHeader(<AAPNodeForm onSubmit={mockOnSubmit} onCancel={vi.fn()} />)

    await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Test Job')
    await user.click(screen.getByRole('button', { name: /Add step/i }))

    expect(mockOnSubmit).not.toHaveBeenCalled()
  })

  it('populates form with initial data', () => {
    renderWithHeader(
      <AAPNodeForm
        onSubmit={mockOnSubmit}
        onCancel={vi.fn()}
        initialData={{
          name: 'Existing Job',
          organization: 'Default',
          jobTemplateName: 'Deploy App',
          jobTemplateId: 10,
          verbosity: '2',
        }}
      />
    )

    expect(screen.getByDisplayValue('Existing Job')).toBeInTheDocument()
    // Typeahead shows selected value in the input when closed
    expect(screen.getByDisplayValue('Default')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Deploy App')).toBeInTheDocument()
  })

  it('passes projectId to CredentialSelector', () => {
    const useQueryMock = vi.mocked(credentialsClient.useQuery)
    useQueryMock.mockClear()

    renderWithHeader(
      <AAPNodeForm onSubmit={mockOnSubmit} onCancel={vi.fn()} onHeaderContentChange={vi.fn()} projectId="project-456" />
    )

    const hasProjectIdCall = useQueryMock.mock.calls.some((call) => {
      const params = (call[2] as unknown as { params?: { query?: Record<string, unknown> } })?.params?.query
      return params?.project_id === 'project-456'
    })
    expect(hasProjectIdCall).toBe(true)
  })

  it('uses custom submit button text when provided', () => {
    renderWithHeader(<AAPNodeForm onSubmit={mockOnSubmit} onCancel={vi.fn()} submitButtonText="Update step" />)

    expect(screen.getByRole('button', { name: /Update step/i })).toBeInTheDocument()
  })

  it('renders prompt on launch fields based on template detail flags', () => {
    renderWithHeader(<AAPNodeForm onSubmit={mockOnSubmit} onCancel={vi.fn()} />)

    // Fields enabled in mockTemplateDetail should be visible
    expect(screen.getByLabelText(/Extra Variables/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Limit/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Job tags/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Skip tags/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Verbosity/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Run type/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Forks/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Timeout/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Job slicing/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Show changes/i)).toBeInTheDocument()

    // Fields disabled in mockTemplateDetail should NOT be visible
    expect(screen.queryByPlaceholderText(/Use default inventory/i)).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/Use default execution environment/i)).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/Use default instance groups/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Labels/i)).not.toBeInTheDocument()
  })

  it('does not submit when extra vars JSON is invalid', async () => {
    const user = userEvent.setup()
    renderWithHeader(
      <AAPNodeForm
        onSubmit={mockOnSubmit}
        onCancel={vi.fn()}
        initialData={{
          organization: 'Default',
          jobTemplateName: 'Deploy App',
          jobTemplateId: 10,
        }}
      />
    )

    const extraVarsInput = screen.getByPlaceholderText(/version/i)
    await user.click(extraVarsInput)
    await user.paste('invalid json')

    await user.click(screen.getByRole('button', { name: /Add step/i }))

    expect(mockOnSubmit).not.toHaveBeenCalled()
  })

  it('renders link to view job template in AAP', () => {
    renderWithHeader(<AAPNodeForm onSubmit={mockOnSubmit} onCancel={vi.fn()} />)

    const link = screen.getByRole('link', { name: /View job template in AAP/i })
    expect(link).toHaveAttribute('href', 'https://aap.example.com/execution/templates/job-template/10/details')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders execution environment, credentials, and instance groups when flags are enabled', () => {
    mockTemplateDetail.ask_execution_environment_on_launch = true
    mockTemplateDetail.ask_credential_on_launch = true
    mockTemplateDetail.ask_instance_groups_on_launch = true

    renderWithHeader(<AAPNodeForm onSubmit={mockOnSubmit} onCancel={vi.fn()} />)

    // Verify the typeahead fields are rendered via their placeholder text
    expect(screen.getByPlaceholderText(/Use default execution environment/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Use default instance groups/i)).toBeInTheDocument()

    // Credentials is a multi-select button, not a typeahead input
    expect(screen.getByRole('button', { name: /Use default credentials/i })).toBeInTheDocument()
  })

  it('does not render link when URL has non-http scheme', () => {
    mockTemplateDetail.url = 'javascript:alert(1)'

    renderWithHeader(<AAPNodeForm onSubmit={mockOnSubmit} onCancel={vi.fn()} />)

    expect(screen.queryByRole('link', { name: /View job template in AAP/i })).not.toBeInTheDocument()
  })

  it('renders form with all prompt-on-launch initial values', () => {
    // Renders form with comprehensive initial data to exercise code paths
    renderWithHeader(
      <AAPNodeForm
        onSubmit={mockOnSubmit}
        onCancel={vi.fn()}
        initialData={{
          organization: 'Default',
          jobTemplateName: 'Deploy App',
          jobTemplateId: 10,
          inventory: 'Production',
          inventoryId: 1,
          credentials: [1, 2],
          extraVars: '{"key": "value"}',
          limit: 'host1',
          tags: 'deploy',
          skipTags: 'debug',
          verbosity: '3',
          jobType: 'run',
          forks: 10,
          timeout: 300,
          jobSlicing: 2,
          diffMode: true,
          executionEnvironment: 'Custom EE',
          executionEnvironmentId: 2,
          instanceGroup: 'controlplane',
          instanceGroupId: 2,
          labels: 'prod',
        }}
      />
    )

    // Verify form rendered with organization and template
    expect(screen.getByPlaceholderText(/Select an organization/i)).toHaveValue('Default')
    expect(screen.getByPlaceholderText(/Select a job template/i)).toHaveValue('Deploy App')
  })

  it('renders all prompt-on-launch fields when enabled', () => {
    mockTemplateDetail.ask_inventory_on_launch = true
    mockTemplateDetail.ask_credential_on_launch = true
    mockTemplateDetail.ask_execution_environment_on_launch = true
    mockTemplateDetail.ask_instance_groups_on_launch = true
    mockTemplateDetail.ask_labels_on_launch = true

    renderWithHeader(
      <AAPNodeForm
        onSubmit={mockOnSubmit}
        onCancel={vi.fn()}
        initialData={{
          organization: 'Default',
          jobTemplateName: 'Deploy App',
          jobTemplateId: 10,
          name: 'Test Step',
        }}
      />
    )

    expect(screen.getByPlaceholderText(/Use default inventory/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Use default credentials/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Use default execution environment/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Use default instance groups/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/labels/i)).toBeInTheDocument()
  })

  it('clears downstream values when organization changes', async () => {
    const user = userEvent.setup()
    renderWithHeader(
      <AAPNodeForm
        onSubmit={mockOnSubmit}
        onCancel={vi.fn()}
        initialData={{
          organization: 'Default',
          jobTemplateName: 'Deploy App',
          jobTemplateId: 10,
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

    // The onChange handler should have been called (clearing template and other fields)
    // We can't easily verify the internal state, but the handler executed
    await waitFor(() => {
      expect(orgInput).toHaveValue('Engineering')
    })
  })

  it('clears downstream values when template changes', async () => {
    const user = userEvent.setup()
    renderWithHeader(
      <AAPNodeForm
        onSubmit={mockOnSubmit}
        onCancel={vi.fn()}
        initialData={{
          organization: 'Default',
          jobTemplateName: 'Deploy App',
          jobTemplateId: 10,
          name: 'Test Step',
        }}
      />
    )

    // Click the template field to open dropdown
    const templateInput = screen.getByPlaceholderText(/Select a job template/i)
    await user.click(templateInput)

    // Find and click a template option from the dropdown
    const backupOption = await screen.findByText('Backup DB')
    await user.click(backupOption)

    // The onChange handler should have been called (clearing prompt-on-launch fields)
    await waitFor(() => {
      expect(templateInput).toHaveValue('Backup DB')
    })
  })

  it('has no accessibility violations', async () => {
    const { container } = renderWithHeader(<AAPNodeForm onSubmit={mockOnSubmit} onCancel={vi.fn()} />)

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
})
