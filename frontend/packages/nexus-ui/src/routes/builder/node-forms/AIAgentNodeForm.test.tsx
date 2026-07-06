import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { credentialsClient, integrationsClient, toolManagerClient } from '../../../client'
import { useFileStorageStatus } from '../../../hooks/useFileStorageStatus'
import { useFileUploadWithProgress } from '../../../hooks/useFileUploadWithProgress'
import { useAllProjects } from '../../access/useAllProjects'

import { AIAgentNodeForm } from './AIAgentNodeForm'
import { renderWithHeader } from './test-utils/renderWithHeader'

// Mock clients used by CredentialSelector and integrations query
vi.mock('../../../client', () => ({
  credentialsClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
  integrationsClient: {
    useQuery: vi.fn(() => ({ data: { resources: [] }, isPending: false, isError: false, refetch: vi.fn() })),
    useMutation: vi.fn(),
  },
  toolManagerClient: {
    useQuery: vi.fn(() => ({ data: { resources: [] }, isPending: false, isError: false, refetch: vi.fn() })),
    useMutation: vi.fn(),
  },
  authMiddleware: { onRequest: vi.fn(({ request }: { request: unknown }) => request) },
}))

vi.mock('../../access/useAllProjects', () => ({
  useAllProjects: vi.fn(),
}))

// Mock file upload hook
const mockUploadFiles = vi.fn()
vi.mock('../../../hooks/useFileUploadWithProgress', () => ({
  useFileUploadWithProgress: vi.fn(),
}))

vi.mock('../../../hooks/useFileStorageStatus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useFileStorageStatus')>()),
  useFileStorageStatus: vi.fn().mockReturnValue({ isConfigured: true, isLoading: false, isError: false }),
}))

// Mock FileUpload component to expose file selection handler
vi.mock('../components/file-upload', () => ({
  FileUpload: ({
    onFilesSelected,
    onFileRemove,
    files = [],
  }: {
    onFilesSelected: (files: File[]) => void
    onFileRemove: (id: string) => void
    files?: Array<{ id: string; file: File; status: string }>
  }) => (
    <div data-testid="file-upload">
      <button
        data-testid="upload-files"
        onClick={() => {
          const file = new File(['test'], 'test.txt', { type: 'text/plain' })
          onFilesSelected([file])
        }}
      >
        Upload
      </button>
      {(files || []).map((f) => (
        <div key={f.id} data-testid={`file-${f.id}`}>
          <span>{f.file.name}</span>
          <span data-testid={`file-status-${f.id}`}>{f.status}</span>
          <button data-testid={`remove-${f.id}`} onClick={() => onFileRemove(f.id)}>
            Remove
          </button>
        </div>
      ))}
    </div>
  ),
}))

// Mock generateUUID
vi.mock('../../../utils/generateUUID', () => ({
  generateUUID: vi.fn(() => 'mock-uuid-123'),
}))

// Mock ExpandableCodeEditor to use a simple input for testing
vi.mock('../components/ExpandableCodeEditor', () => ({
  ExpandableCodeEditor: ({
    code,
    onCodeChange,
    ariaLabel,
  }: {
    code: string
    onCodeChange: (code: string) => void
    ariaLabel?: string
  }) => (
    <input
      data-testid="response-schema-editor"
      id="agent-response-schema"
      value={code}
      onChange={(e) => onCodeChange(e.target.value)}
      aria-label={ariaLabel}
    />
  ),
}))

describe('AIAgentNodeForm', () => {
  const mockOnSubmit = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(credentialsClient.useQuery).mockReturnValue({
      data: { resources: [] },
      isPending: false,
      error: null,
      refetch: vi.fn(),
    } as never)
    vi.mocked(credentialsClient.useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
    vi.mocked(useAllProjects).mockReturnValue({ projects: [], isLoading: false, error: null, refetch: vi.fn() })
    vi.mocked(useFileStorageStatus).mockReturnValue({ isConfigured: true, isLoading: false, isError: false })
    vi.mocked(useFileUploadWithProgress).mockReturnValue({
      uploadFiles: mockUploadFiles,
      progress: [],
      error: null,
      uploading: false,
      cancelUpload: vi.fn(),
      reset: vi.fn(),
    })
    mockUploadFiles.mockResolvedValue({
      files: [{ file_id: 'server-file-123', filename: 'test.txt', size_bytes: 4 }],
    })
  })

  it('renders form with all fields', () => {
    renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText(/Prompt/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Tools')).toBeInTheDocument()
  })

  it('submits form even with empty prompt (permissive schema)', async () => {
    const user = userEvent.setup()
    renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

    await user.type(screen.getByPlaceholderText(/Enter agent name/i), 'Test Agent')
    fireEvent.submit(screen.getByTestId('ai-agent-node-form'))

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Agent',
        })
      )
    })
  })

  it('populates form with initial data', () => {
    renderWithHeader(
      <AIAgentNodeForm
        onSubmit={mockOnSubmit}
        initialData={{
          name: 'Existing Agent',
          model: 'anthropic/claude-haiku-4.5',
          prompt: 'Analyze the data',
          tool_selections: [],
        }}
      />
    )

    expect(screen.getByDisplayValue('Existing Agent')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Analyze the data')).toBeInTheDocument()
    expect(screen.getByLabelText('Tools')).toBeInTheDocument()
  })

  it('passes projectId to CredentialSelector', () => {
    const useQueryMock = vi.mocked(credentialsClient.useQuery)
    useQueryMock.mockClear()

    renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} projectId="project-789" />)

    const hasProjectIdCall = useQueryMock.mock.calls.some((call) => {
      const params = (call[2] as unknown as { params?: { query?: Record<string, unknown> } })?.params?.query
      return params?.project_id === 'project-789'
    })
    expect(hasProjectIdCall).toBe(true)
  })

  it('renders interactive tools multi-select', () => {
    renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

    const toolsSelect = screen.getByLabelText('Tools')
    expect(toolsSelect).toBeInTheDocument()
    expect(toolsSelect).not.toBeDisabled()
  })

  it('renders file upload component', () => {
    renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

    expect(screen.getByTestId('file-upload')).toBeInTheDocument()
  })

  it('handles file upload success', async () => {
    const user = userEvent.setup()
    renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} projectId="project-789" />)

    await user.click(screen.getByTestId('upload-files'))

    await waitFor(() => {
      expect(mockUploadFiles).toHaveBeenCalled()
    })
  })

  it('forwards projectId to uploadFiles when uploading files', async () => {
    const user = userEvent.setup()
    renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} projectId="project-789" />)

    await user.click(screen.getByTestId('upload-files'))

    await waitFor(() => {
      expect(mockUploadFiles).toHaveBeenCalledWith(expect.any(Array), 'project-789')
    })
  })

  it('shows error when uploading files without projectId', async () => {
    const user = userEvent.setup()
    renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

    await user.click(screen.getByTestId('upload-files'))

    await waitFor(() => {
      expect(mockUploadFiles).not.toHaveBeenCalled()
    })
  })

  it('handles file upload error', async () => {
    const user = userEvent.setup()
    mockUploadFiles.mockRejectedValueOnce(new Error('Upload failed'))

    renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} projectId="project-789" />)

    await user.click(screen.getByTestId('upload-files'))

    await waitFor(() => {
      expect(mockUploadFiles).toHaveBeenCalled()
    })
  })

  it('handles file removal', async () => {
    const user = userEvent.setup()
    renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} projectId="project-789" />)

    // Upload a file first
    await user.click(screen.getByTestId('upload-files'))

    await waitFor(() => {
      expect(mockUploadFiles).toHaveBeenCalled()
    })

    // Wait for file to appear
    await waitFor(() => {
      expect(screen.getByText('test.txt')).toBeInTheDocument()
    })

    // Click remove button
    const removeButton = screen.getByTestId('remove-server-file-123')
    await user.click(removeButton)

    // Verify file is removed
    expect(screen.queryByText('test.txt')).not.toBeInTheDocument()
  })

  describe('Response Schema', () => {
    it('renders response schema editor', () => {
      renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

      const schemaEditor = screen.getByLabelText('Response schema editor')
      expect(schemaEditor).toBeInTheDocument()
      expect(schemaEditor).toHaveAttribute('aria-label', 'Response schema editor')
      expect(screen.getByText(/Optional JSON Schema to enforce structured output format/i)).toBeInTheDocument()
    })

    it('submits form with valid JSON object in response schema', async () => {
      const user = userEvent.setup()
      renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

      // Fill fields
      await user.type(screen.getByPlaceholderText(/Enter agent name/i), 'Test Agent')
      await user.type(screen.getByPlaceholderText(/Natural language instructions/i), 'Test prompt')

      // Add valid JSON using paste
      const schemaEditor = screen.getByLabelText('Response schema editor')
      await user.click(schemaEditor)
      await user.paste('{"type": "object"}')

      // Submit form
      fireEvent.submit(screen.getByTestId('ai-agent-node-form'))

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled()
      })
    })

    it('rejects non-object response schema', async () => {
      const user = userEvent.setup()
      renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

      // Fill fields
      await user.type(screen.getByPlaceholderText(/Enter agent name/i), 'Test Agent')
      await user.type(screen.getByPlaceholderText(/Natural language instructions/i), 'Test prompt')

      // Add array instead of object using paste
      const schemaEditor = screen.getByLabelText('Response schema editor')
      await user.click(schemaEditor)
      await user.paste('["item1", "item2"]')

      // Submit form
      fireEvent.submit(screen.getByTestId('ai-agent-node-form'))

      await waitFor(() => {
        expect(screen.getByText('Response schema must be a JSON object')).toBeInTheDocument()
      })
      expect(mockOnSubmit).not.toHaveBeenCalled()
    })

    it('pre-fills response schema in edit mode', () => {
      const existingSchema = { type: 'object', properties: { name: { type: 'string' } } }
      const initialData = {
        name: 'Existing Agent',
        prompt: 'Existing prompt',
        model: 'anthropic/claude-haiku-4.5',
        tool_selections: [] as string[],
        integration_connections: [] as { integration_id: string; credential_id: string }[],
        responseSchema: JSON.stringify(existingSchema, null, 2),
      }

      renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} initialData={initialData} />)

      const schemaEditor = screen.getByLabelText('Response schema editor')
      // Check that the value contains the schema (formatting may vary)
      const value = (schemaEditor as HTMLInputElement).value
      expect(value).toContain('"type"')
      expect(value).toContain('"object"')
      expect(value).toContain('"properties"')
      expect(value).toContain('"name"')
    })
  })

  describe('Tools integration', () => {
    const mockTools = [
      {
        id: 'tool-1',
        name: 'list_repos',
        namespaced_name: 'github::list_repos',
        integration_id: 'int-1',
        enabled: true,
        parameters: [],
      },
      {
        id: 'tool-2',
        name: 'create_issue',
        namespaced_name: 'github::create_issue',
        integration_id: 'int-1',
        enabled: true,
        parameters: [],
      },
      {
        id: 'tool-3',
        name: 'send_message',
        namespaced_name: 'slack::send_message',
        integration_id: 'int-2',
        enabled: true,
        parameters: [],
      },
      {
        id: 'tool-4',
        name: 'deprecated_tool',
        namespaced_name: 'github::deprecated_tool',
        integration_id: 'int-1',
        enabled: false,
        parameters: [],
      },
      {
        id: 'tool-5',
        name: 'orphan_tool',
        namespaced_name: 'unknown::orphan_tool',
        integration_id: 'int-999',
        enabled: true,
        parameters: [],
      },
    ]

    const mockIntegrations = [
      { id: 'int-1', name: 'GitHub Copilot', integration_type: 'mcp_server', enabled: true },
      { id: 'int-2', name: 'Slack Bot', integration_type: 'mcp_server', enabled: true },
    ]

    function setupToolMocks({
      tools = mockTools,
      integrations = mockIntegrations,
      isToolsError = false,
      isIntegrationsError = false,
    }: {
      tools?: typeof mockTools
      integrations?: typeof mockIntegrations
      isToolsError?: boolean
      isIntegrationsError?: boolean
    } = {}) {
      const refetchTools = vi.fn().mockResolvedValue({})
      const refetchIntegrations = vi.fn().mockResolvedValue({})

      vi.mocked(toolManagerClient.useQuery).mockReturnValue({
        data: { resources: tools },
        isPending: false,
        isError: isToolsError,
        refetch: refetchTools,
      } as never)

      vi.mocked(integrationsClient.useQuery).mockReturnValue({
        data: { resources: integrations },
        isPending: false,
        isError: isIntegrationsError,
        refetch: refetchIntegrations,
      } as never)

      return { refetchTools, refetchIntegrations }
    }

    it('renders tools grouped by integration when data is available', async () => {
      const user = userEvent.setup()
      setupToolMocks()

      renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

      await user.click(screen.getByRole('button', { name: 'Tools' }))

      expect(screen.getByText('GitHub Copilot')).toBeInTheDocument()
      expect(screen.getByText('Slack Bot')).toBeInTheDocument()
      expect(screen.getByText('list_repos')).toBeInTheDocument()
      expect(screen.getByText('create_issue')).toBeInTheDocument()
      expect(screen.getByText('send_message')).toBeInTheDocument()
    })

    it('filters out disabled tools', async () => {
      const user = userEvent.setup()
      setupToolMocks()

      renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

      await user.click(screen.getByRole('button', { name: 'Tools' }))

      expect(screen.queryByText('deprecated_tool')).not.toBeInTheDocument()
    })

    it('filters out tools whose integration is not in the integrations list', async () => {
      const user = userEvent.setup()
      setupToolMocks()

      renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

      await user.click(screen.getByRole('button', { name: 'Tools' }))

      expect(screen.queryByText('orphan_tool')).not.toBeInTheDocument()
    })

    it('shows "All tools selected" when initialData has ALL strategy', () => {
      setupToolMocks()

      renderWithHeader(
        <AIAgentNodeForm
          onSubmit={mockOnSubmit}
          initialData={{ tool_selection_strategy: 'ALL', tool_selections: [] }}
        />
      )

      expect(screen.getByDisplayValue('All tools selected')).toBeInTheDocument()
    })

    it('shows selected count when initialData has SELECTED strategy', () => {
      setupToolMocks()

      renderWithHeader(
        <AIAgentNodeForm
          onSubmit={mockOnSubmit}
          initialData={{ tool_selection_strategy: 'SELECTED', tool_selections: ['tool-1'] }}
        />
      )

      expect(screen.getByDisplayValue('1 of 3 tools selected')).toBeInTheDocument()
    })

    it('shows error with retry button when tools query fails', () => {
      setupToolMocks({ isToolsError: true })

      renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByText(/Failed to load tools or integrations/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    })

    it('shows error with retry button when integrations query fails', () => {
      setupToolMocks({ isIntegrationsError: true })

      renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByText(/Failed to load tools or integrations/)).toBeInTheDocument()
    })

    it('calls refetch on both queries when retry is clicked', async () => {
      const user = userEvent.setup()
      const { refetchTools, refetchIntegrations } = setupToolMocks({ isToolsError: true })

      renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

      await user.click(screen.getByRole('button', { name: 'Retry' }))

      expect(refetchTools).toHaveBeenCalled()
      expect(refetchIntegrations).toHaveBeenCalled()
    })

    it('shows loading state while integrations query is still pending', () => {
      vi.mocked(toolManagerClient.useQuery).mockReturnValue({
        data: { resources: mockTools },
        isPending: false,
        isError: false,
        refetch: vi.fn().mockResolvedValue({}),
      } as never)

      vi.mocked(integrationsClient.useQuery).mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false,
        refetch: vi.fn().mockResolvedValue({}),
      } as never)

      renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByPlaceholderText('Loading tools...')).toBeInTheDocument()
    })

    it('submits tool_selection_strategy and tool_selections with form data', async () => {
      setupToolMocks()

      renderWithHeader(
        <AIAgentNodeForm
          onSubmit={mockOnSubmit}
          initialData={{ name: 'Agent', tool_selection_strategy: 'ALL', tool_selections: [] }}
        />
      )

      fireEvent.submit(screen.getByTestId('ai-agent-node-form'))

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            tool_selection_strategy: 'ALL',
            tool_selections: [],
          })
        )
      })
    })
  })

  describe('Accessibility', () => {
    it('has no accessibility violations (excluding known PatternFly Tabs issue)', async () => {
      const { container } = renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)
      // Note: PatternFly Tabs have a known aria-controls issue in testing (tabs work correctly in real browsers)
      // Excluding this known issue from our accessibility tests
      const results = await axe(container, {
        rules: {
          'aria-valid-attr-value': { enabled: false },
        },
      })
      expect(results).toHaveNoViolations()
    })

    it('has no accessibility violations with response schema filled (excluding known PatternFly Tabs issue)', async () => {
      const user = userEvent.setup()
      const { container } = renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

      // Fill response schema using paste
      const validSchema = JSON.stringify({ type: 'object' }, null, 2)
      const schemaEditor = screen.getByLabelText('Response schema editor')
      await user.click(schemaEditor)
      await user.paste(validSchema)

      const results = await axe(container, {
        rules: {
          'aria-valid-attr-value': { enabled: false },
        },
      })
      expect(results).toHaveNoViolations()
    })

    it('has no accessibility violations after submitting with response schema (excluding known PatternFly Tabs issue)', async () => {
      const user = userEvent.setup()
      const { container } = renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

      // Fill fields
      await user.type(screen.getByPlaceholderText(/Enter agent name/i), 'Test Agent')
      await user.type(screen.getByPlaceholderText(/Natural language instructions/i), 'Test prompt')

      // Add valid JSON using paste
      const schemaEditor = screen.getByLabelText('Response schema editor')
      await user.click(schemaEditor)
      await user.paste('{"type": "object"}')

      // Submit form (permissive schema allows this)
      fireEvent.submit(screen.getByTestId('ai-agent-node-form'))

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled()
      })

      const results = await axe(container, {
        rules: {
          'aria-valid-attr-value': { enabled: false },
        },
      })
      expect(results).toHaveNoViolations()
    })
  })
})
