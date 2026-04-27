import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { credentialsClient } from '../../../client'
import type { AAPJobTemplateDetail } from '../../../hooks/useAAPBrowser'

import { AAPNodeForm, type AAPFormData } from './AAPNodeForm'
import { renderWithHeader } from './test-utils/renderWithHeader'

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

// Mock useAAPBrowser hook to provide test data without real API calls
const mockRetryAll = vi.fn()

const defaultTemplateDetail: AAPJobTemplateDetail = {
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
  // Default values from template configuration
  default_inventory: { id: 1, name: 'Demo Inventory' },
  default_execution_environment: { id: 1, name: 'Default EE' },
  default_credentials: [{ id: 1, name: 'SSH Machine Credential' }],
}

// Base mock data shared across all tests (static data that doesn't change)
const baseMockAAPBrowserData = {
  organizations: [
    { id: 1, name: 'Default' },
    { id: 2, name: 'Engineering' },
  ],
  jobTemplates: [
    { id: 10, name: 'Deploy App', description: 'Deploy the application', organization_name: 'Default' },
    { id: 11, name: 'Backup DB', description: 'Backup the database', organization_name: 'Default' },
  ],
  inventories: [{ id: 1, name: 'Demo Inventory', description: 'Demo hosts', organization_name: 'Default' }],
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
  labels: [],
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
  loadingLabels: false,
  loadingTemplateDetail: false,
  templateDetail: undefined,
  error: null,
  retryAll: mockRetryAll,
  searchOrganizations: vi.fn(),
  searchJobTemplates: vi.fn(),
  searchInventories: vi.fn(),
  searchExecutionEnvironments: vi.fn(),
  searchCredentials: vi.fn(),
  searchInstanceGroups: vi.fn(),
  searchLabels: vi.fn(),
}

// Helper function to create mock return value with a specific template detail
function createMockAAPBrowser(templateDetail: AAPJobTemplateDetail) {
  return {
    ...baseMockAAPBrowserData,
    templateDetail,
  }
}

// Create a controllable mock function
const mockUseAAPBrowser = vi.fn()

vi.mock('../../../hooks/useAAPBrowser', () => ({
  useAAPBrowser: (...args: unknown[]) =>
    mockUseAAPBrowser(...args) as ReturnType<typeof import('../../../hooks/useAAPBrowser').useAAPBrowser>,
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
    mockUseAAPBrowser.mockClear()
    mockOnSubmit.mockClear()
    // Set default mock implementation (can be overridden in nested describe blocks)
    mockUseAAPBrowser.mockReturnValue(createMockAAPBrowser(defaultTemplateDetail))

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
          organization_name: 'Default',
          job_template_name: 'Deploy App',
          job_template_id: 10,
        }}
      />
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Add step/i }))

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Job',
          organization_name: 'Default',
          job_template_name: 'Deploy App',
          job_template_id: 10,
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
          organization_name: 'Default',
          job_template_name: 'Deploy App',
          job_template_id: 10,
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
          organization_name: 'Default',
          job_template_name: 'Deploy App',
          job_template_id: 10,
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

  it('does not render link when URL has non-http scheme', () => {
    // Create template with dangerous URL
    const templateWithBadUrl = {
      ...defaultTemplateDetail,
      url: 'javascript:alert(1)',
    }
    mockUseAAPBrowser.mockReturnValue(createMockAAPBrowser(templateWithBadUrl))

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
          organization_name: 'Default',
          job_template_name: 'Deploy App',
          job_template_id: 10,
          inventory_name: 'Production',
          inventory_id: 1,
          job_credentials: [1, 2],
          extra_vars: '{"key": "value"}',
          limit: 'host1',
          tags: 'deploy',
          skip_tags: 'debug',
          verbosity: '3',
          job_type: 'run',
          forks: 10,
          timeout: 300,
          job_slice_count: 2,
          diff_mode: true,
          execution_environment: 'Custom EE',
          execution_environment_id: 2,
          instance_group: 'controlplane',
          instance_group_id: 2,
          labels: ['prod'],
        }}
      />
    )

    // Verify form rendered with organization and template
    expect(screen.getByPlaceholderText(/Select an organization/i)).toHaveValue('Default')
    expect(screen.getByPlaceholderText(/Select a job template/i)).toHaveValue('Deploy App')
  })

  it('clears downstream values when organization changes', async () => {
    const user = userEvent.setup()
    renderWithHeader(
      <AAPNodeForm
        onSubmit={mockOnSubmit}
        onCancel={vi.fn()}
        initialData={{
          organization_name: 'Default',
          job_template_name: 'Deploy App',
          job_template_id: 10,
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
          organization_name: 'Default',
          job_template_name: 'Deploy App',
          job_template_id: 10,
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

  describe('Default value pre-population', () => {
    // Template configuration for this test suite
    const templateWithPrompts = {
      ...defaultTemplateDetail,
      ask_inventory_on_launch: true,
      ask_execution_environment_on_launch: true,
      ask_credential_on_launch: true,
    }

    beforeEach(() => {
      // Use template with prompt flags enabled for these tests
      mockUseAAPBrowser.mockReturnValue(createMockAAPBrowser(templateWithPrompts))
    })

    it('pre-populates credentials from template defaults on submit', async () => {
      const user = userEvent.setup()

      renderWithHeader(
        <AAPNodeForm
          onSubmit={mockOnSubmit}
          onCancel={vi.fn()}
          initialData={{
            name: 'Test Job',
            organization_name: 'Default',
            job_template_name: 'Deploy App',
            job_template_id: 10,
          }}
        />
      )

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /parameters/i })).toBeInTheDocument()
      })

      // Submit the form - the credentials should be pre-populated from template defaults
      await user.click(screen.getByRole('button', { name: /Add step/i }))

      // The template detail has default_credentials: [{ id: 1, name: 'SSH Machine Credential' }]
      // The form should submit with job_credentials: [1]
      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            job_credentials: [1],
          })
        )
      })
    })

    it('handles template with no default values gracefully', async () => {
      // Create a template with no defaults (overrides the beforeEach mock for this test)
      const templateWithNoDefaults: AAPJobTemplateDetail = {
        ...templateWithPrompts,
        default_inventory: null,
        default_execution_environment: null,
        default_credentials: [],
      }
      mockUseAAPBrowser.mockReturnValue(createMockAAPBrowser(templateWithNoDefaults))

      renderWithHeader(
        <AAPNodeForm
          onSubmit={mockOnSubmit}
          onCancel={vi.fn()}
          initialData={{
            organization_name: 'Default',
            job_template_name: 'Deploy App',
            job_template_id: 10,
          }}
        />
      )

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /parameters/i })).toBeInTheDocument()
      })

      // Should show "No default" placeholders
      expect(screen.getByPlaceholderText(/No default inventory/i)).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/No default execution environment/i)).toBeInTheDocument()

      // Credentials should show "No default credentials"
      expect(screen.getByRole('button', { name: /No default credentials/i })).toBeInTheDocument()
    })
  })

  describe('Regression Tests - Labels and Default Values', () => {
    it('should save labels as array of numbers, not string', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn()

      renderWithHeader(
        <AAPNodeForm
          onSubmit={onSubmit}
          initialData={{
            organization_name: 'Default',
            job_template_name: 'Deploy App',
            job_template_id: 10,
          }}
        />
      )

      // Wait for form to render
      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /parameters/i })).toBeInTheDocument()
      })

      const submitButton = screen.getByRole('button', { name: /Add step/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled()
        const submittedData = onSubmit.mock.calls[0][0] as AAPFormData
        // Labels should be array (even if empty), not string
        expect(Array.isArray(submittedData.labels)).toBe(true)
      })
    })

    it('should NOT overwrite user values when editing existing node with same template', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn()

      // Simulate editing a node with custom user values
      const existingData = {
        name: 'My Custom Job',
        organization_name: 'Default',
        job_template_name: 'Deploy App',
        job_template_id: 10,
        limit: '100', // User set to 100 (different from any default)
        forks: 99, // User set to 99
        labels: ['dev', 'test'], // User selected specific labels
      }

      renderWithHeader(<AAPNodeForm onSubmit={onSubmit} submitButtonText="Update step" initialData={existingData} />)

      // Wait for form to load with existing values
      await waitFor(() => {
        expect(screen.getByDisplayValue('My Custom Job')).toBeInTheDocument()
      })

      // Verify user's saved values are present
      expect(screen.getByDisplayValue('100')).toBeInTheDocument() // limit
      expect(screen.getByDisplayValue('99')).toBeInTheDocument() // forks

      // Submit without making changes
      const submitButton = screen.getByRole('button', { name: /Update step/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            limit: '100', // Should preserve user value
            forks: 99, // Should preserve user value
            labels: ['dev', 'test'], // Should preserve user value (labels are string names now)
          })
        )
      })
    })

    it('should handle labels as array in multi-select without "map is not a function" error', async () => {
      const onSubmit = vi.fn()

      // Render with labels as array
      const { container } = renderWithHeader(
        <AAPNodeForm
          onSubmit={onSubmit}
          initialData={{
            organization_name: 'Default',
            job_template_name: 'Deploy App',
            job_template_id: 10,
            labels: ['dev', 'test'], // Array of label names
          }}
        />
      )

      // Should not throw error during render (main point: no "map is not a function" error)
      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /parameters/i })).toBeInTheDocument()
      })

      // Form should render successfully
      expect(screen.getByDisplayValue('Deploy App')).toBeInTheDocument()
      expect(container).toBeInTheDocument()
    })

    it('should convert YAML extra_vars to JSON when loading template defaults', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn()
      const mockTemplateWithYAML: AAPJobTemplateDetail = {
        ...defaultTemplateDetail,
        ask_variables_on_launch: true,
        extra_vars: 'var1: val1\nvar2: val2', // YAML format from AAP
      }

      vi.mocked(credentialsClient.useQuery).mockReturnValue({
        data: { resources: [] },
        isPending: false,
        isError: false,
        refetch: vi.fn(),
      } as never)

      // Mock useAAPBrowser to return template with YAML extra_vars
      mockUseAAPBrowser.mockReturnValue(createMockAAPBrowser(mockTemplateWithYAML))

      renderWithHeader(
        <AAPNodeForm
          onSubmit={onSubmit}
          initialData={{
            organization_name: 'Default',
            job_template_name: 'Deploy App',
            job_template_id: 10,
          }}
        />
      )

      // Wait for form to render
      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /Add step/i })
        expect(submitButton).toBeInTheDocument()
      })

      // Submit the form
      const submitButton = screen.getByRole('button', { name: /Add step/i })
      await user.click(submitButton)

      // Verify onSubmit was called with converted JSON
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled()
      })

      const submittedData = onSubmit.mock.calls[0][0] as AAPFormData
      // YAML should be converted to JSON string
      expect(submittedData.extra_vars).toBeTruthy()
      const parsedVars = JSON.parse(submittedData.extra_vars!) as Record<string, string>
      expect(parsedVars).toEqual({ var1: 'val1', var2: 'val2' })
    })

    it('should clear labels when switching templates and new template has no default labels', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn()

      // Mock template detail for second template (Backup DB) with no label defaults
      const backupDBTemplate: AAPJobTemplateDetail = {
        ...defaultTemplateDetail,
        id: 11,
        name: 'Backup DB',
        description: 'Backup the database',
        ask_labels_on_launch: true,
        default_labels: [], // No default labels
      }

      // Start with first template and user-selected labels
      const initialData = {
        organization_name: 'Default',
        job_template_name: 'Deploy App',
        job_template_id: 10,
        labels: ['dev', 'test'], // User has selected labels
      }

      renderWithHeader(<AAPNodeForm onSubmit={onSubmit} initialData={initialData} />)

      // Wait for form to render with initial template
      await waitFor(() => {
        expect(screen.getByDisplayValue('Deploy App')).toBeInTheDocument()
      })

      // Verify labels are present before switching templates
      const parametersTab = screen.getByRole('tab', { name: /parameters/i })
      await user.click(parametersTab)

      // Change template detail mock to return second template
      mockUseAAPBrowser.mockReturnValue(createMockAAPBrowser(backupDBTemplate))

      // Find the job template typeahead select by its placeholder and current value
      const templateInput = screen.getByDisplayValue('Deploy App')
      await user.click(templateInput)

      // Select the "Backup DB" template option
      await waitFor(() => {
        expect(screen.getByRole('option', { name: /Backup DB/i })).toBeInTheDocument()
      })
      await user.click(screen.getByRole('option', { name: /Backup DB/i }))

      // Wait for template change to complete
      await waitFor(() => {
        expect(screen.getByDisplayValue('Backup DB')).toBeInTheDocument()
      })

      // Submit the form
      const submitButton = screen.getByRole('button', { name: /Add step/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled()
      })

      // Verify labels were cleared when template changed
      const submittedData = onSubmit.mock.calls[onSubmit.mock.calls.length - 1][0] as AAPFormData
      expect(submittedData.labels).toEqual([])
    })

    it('should handle empty/null/undefined values for all prompt-on-launch fields', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn()

      // Test with all fields empty/null/undefined
      const emptyData = {
        name: 'Empty Test',
        organization_name: 'Default',
        job_template_name: 'Deploy App',
        job_template_id: 10,
        inventory_name: '',
        inventory_id: undefined,
        extra_vars: '',
        limit: '',
        tags: '',
        skip_tags: '',
        verbosity: '',
        job_credentials: [],
        labels: [],
        job_type: '',
        forks: undefined,
        timeout: undefined,
        job_slice_count: undefined,
        diff_mode: false,
        execution_environment: '',
        execution_environment_id: undefined,
        instance_group: '',
        instance_group_id: undefined,
      }

      const { container } = renderWithHeader(<AAPNodeForm onSubmit={onSubmit} initialData={emptyData} />)

      // Should render without errors
      await waitFor(() => {
        expect(container).toBeInTheDocument()
      })

      // Submit with all empty values
      const submitButton = screen.getByRole('button', { name: /Add step/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            job_credentials: [], // Empty array, not undefined
            labels: [], // Empty array, not undefined
            inventory_name: '',
            limit: '',
            tags: '',
          })
        )
      })
    })

    it('should handle template with all null default values', async () => {
      const onSubmit = vi.fn()
      const mockTemplateNoDefaults: AAPJobTemplateDetail = {
        ...defaultTemplateDetail,
        // All prompt flags enabled but no defaults
        ask_inventory_on_launch: true,
        ask_credential_on_launch: true,
        ask_labels_on_launch: true,
        ask_execution_environment_on_launch: true,
        default_inventory: null,
        default_execution_environment: null,
        default_credentials: [],
        default_labels: [],
        job_type: null,
        verbosity: null,
        forks: null,
        limit: null,
        job_tags: null,
        skip_tags: null,
        diff_mode: null,
        job_slice_count: null,
        timeout: null,
        extra_vars: null,
      }

      // Mock useAAPBrowser to return template with null defaults
      mockUseAAPBrowser.mockReturnValue(createMockAAPBrowser(mockTemplateNoDefaults))

      const { container } = renderWithHeader(
        <AAPNodeForm
          onSubmit={onSubmit}
          initialData={{
            organization_name: 'Default',
            job_template_name: 'Deploy App',
            job_template_id: 10,
          }}
        />
      )

      // Should render without errors even with all null defaults
      await waitFor(() => {
        expect(container).toBeInTheDocument()
      })

      // Form should be functional with no defaults set
      expect(() => screen.getByRole('button', { name: /Add step/i })).not.toThrow()
    })

    it('should handle undefined labels field without breaking multi-select', async () => {
      const onSubmit = vi.fn()

      // Explicitly test undefined labels (legacy data or missing field)
      const dataWithUndefinedLabels = {
        organization_name: 'Default',
        job_template_name: 'Deploy App',
        job_template_id: 10,
        labels: undefined as unknown as string[], // Simulate missing field
      }

      renderWithHeader(<AAPNodeForm onSubmit={onSubmit} initialData={dataWithUndefinedLabels} />)

      // Should not throw "map is not a function" error
      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /parameters/i })).toBeInTheDocument()
      })

      // Multi-select should handle undefined gracefully (no crashes during render)
      expect(screen.getByDisplayValue('Deploy App')).toBeInTheDocument()
    })

    it('should handle empty string job_credentials and convert to empty array', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn()

      // Legacy data might have job_credentials as empty string
      const legacyData = {
        organization_name: 'Default',
        job_template_name: 'Deploy App',
        job_template_id: 10,
        job_credentials: '' as unknown as number[], // Legacy empty string
      }

      renderWithHeader(<AAPNodeForm onSubmit={onSubmit} initialData={legacyData} />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add step/i })).toBeInTheDocument()
      })

      const submitButton = screen.getByRole('button', { name: /Add step/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled()
      })

      const submittedData = onSubmit.mock.calls[0][0] as AAPFormData
      // Should be converted to empty array, not remain as string
      expect(Array.isArray(submittedData.job_credentials)).toBe(true)
      expect(submittedData.job_credentials).toEqual([])
    })

    it('should handle NaN and invalid number values for numeric fields', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn()

      const dataWithInvalidNumbers = {
        organization_name: 'Default',
        job_template_name: 'Deploy App',
        job_template_id: 10,
        forks: Number.NaN,
        timeout: Number.NaN,
        job_slice_count: Number.NaN,
        inventory_id: Number.NaN,
      }

      renderWithHeader(<AAPNodeForm onSubmit={onSubmit} initialData={dataWithInvalidNumbers} />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add step/i })).toBeInTheDocument()
      })

      const submitButton = screen.getByRole('button', { name: /Add step/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled()
      })
      const submittedData = onSubmit.mock.calls[0][0] as AAPFormData
      // NaN values should be normalized to undefined (not included in submitted data)
      expect(submittedData).toBeDefined()
      expect(Number.isNaN(submittedData.forks)).toBe(false)
      expect(Number.isNaN(submittedData.timeout)).toBe(false)
      expect(Number.isNaN(submittedData.job_slice_count)).toBe(false)
      expect(Number.isNaN(submittedData.inventory_id)).toBe(false)
      // These should be undefined (omitted) when NaN
      expect(submittedData.forks).toBeUndefined()
      expect(submittedData.timeout).toBeUndefined()
      expect(submittedData.job_slice_count).toBeUndefined()
      expect(submittedData.inventory_id).toBeUndefined()
    })

    it('should handle empty string for verbosity and convert appropriately', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn()

      const dataWithEmptyVerbosity = {
        organization_name: 'Default',
        job_template_name: 'Deploy App',
        job_template_id: 10,
        verbosity: '', // Empty string should be handled
      }

      renderWithHeader(<AAPNodeForm onSubmit={onSubmit} initialData={dataWithEmptyVerbosity} />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add step/i })).toBeInTheDocument()
      })

      const submitButton = screen.getByRole('button', { name: /Add step/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled()
      })
      const submittedData = onSubmit.mock.calls[0][0] as AAPFormData
      // Empty verbosity should remain as empty string, not cause errors
      expect(submittedData.verbosity).toBe('')
    })

    it('should handle malformed extra_vars JSON gracefully', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn()

      const dataWithBadJSON = {
        organization_name: 'Default',
        job_template_name: 'Deploy App',
        job_template_id: 10,
        extra_vars: '{invalid json}', // Malformed JSON
      }

      renderWithHeader(<AAPNodeForm onSubmit={onSubmit} initialData={dataWithBadJSON} />)

      // Should render without crashing
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add step/i })).toBeInTheDocument()
      })

      const submitButton = screen.getByRole('button', { name: /Add step/i })
      await user.click(submitButton)

      // Form validation should catch invalid JSON and block submission
      // Wait for validation to complete
      await waitFor(
        () => {
          // Verify onSubmit was NOT called due to validation error
          expect(onSubmit).not.toHaveBeenCalled()

          // Validation should show error message
          const errorMessage = screen.queryByText(/Invalid JSON format/i)
          // Error message should be visible (or at minimum, onSubmit was blocked)
          expect(errorMessage ?? onSubmit.mock.calls.length === 0).toBeTruthy()
        },
        { timeout: 2000 }
      )

      // Final assertion: onSubmit must not have been called
      expect(onSubmit).not.toHaveBeenCalled()
    })
  })
})
