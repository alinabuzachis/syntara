import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { credentialsClient, integrationsClient, toolManagerClient } from '../../../client'
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
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: {
        resources: [
          {
            id: 'int-1',
            name: 'Primary MCP Server',
            integration_type: 'mcp_server',
            configuration: {
              integration_type: 'mcp_server',
              base_url: 'https://mcp.example.com',
              discovered_tools: [
                { name: 'list_resources', description: 'List resources' },
                { name: 'get_resource', description: 'Get resource' },
              ],
            },
          },
        ],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never)
    vi.mocked(useAllProjects).mockReturnValue({ projects: [], isLoading: false, error: null, refetch: vi.fn() })
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
    expect(screen.getByPlaceholderText('Select tools')).toBeInTheDocument()
  })

  it('validates required prompt field', async () => {
    const user = userEvent.setup()
    renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

    await user.type(screen.getByPlaceholderText(/Enter agent name/i), 'Test Agent')
    fireEvent.submit(screen.getByTestId('ai-agent-node-form'))

    await waitFor(() => {
      expect(screen.getByText('Prompt is required')).toBeInTheDocument()
      expect(mockOnSubmit).not.toHaveBeenCalled()
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
    expect(screen.getByDisplayValue('No tools selected')).toBeInTheDocument()
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

  it('renders tools multi-select with no tools selected by default', () => {
    renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

    expect(screen.getByPlaceholderText('Select tools')).toBeInTheDocument()
    expect(screen.getByDisplayValue('No tools selected')).toBeInTheDocument()
  })

  it('excludes disabled tools from the tools dropdown', async () => {
    const user = userEvent.setup()
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: {
        resources: [{ id: 'int-1', name: 'My MCP Server', integration_type: 'mcp_server', configuration: {} }],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never)
    vi.mocked(toolManagerClient.useQuery).mockReturnValue({
      data: {
        resources: [
          { id: 't1', namespaced_name: 'My MCP Server::enabled_tool', enabled: true, integration_id: 'int-1' },
          { id: 't2', namespaced_name: 'My MCP Server::disabled_tool', enabled: false, integration_id: 'int-1' },
          { id: 't3', namespaced_name: 'My MCP Server::also_enabled', integration_id: 'int-1' },
        ],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never)

    renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)
    await user.click(screen.getByRole('button', { name: 'Tools' }))

    expect(screen.getByText('enabled_tool')).toBeInTheDocument()
    expect(screen.getByText('also_enabled')).toBeInTheDocument()
    expect(screen.queryByText('disabled_tool')).not.toBeInTheDocument()
  })

  it('renders file upload component', () => {
    renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

    expect(screen.getByTestId('file-upload')).toBeInTheDocument()
  })

  it('handles file upload success', async () => {
    const user = userEvent.setup()
    renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

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

  it('handles file upload error', async () => {
    const user = userEvent.setup()
    mockUploadFiles.mockRejectedValueOnce(new Error('Upload failed'))

    renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

    await user.click(screen.getByTestId('upload-files'))

    await waitFor(() => {
      expect(mockUploadFiles).toHaveBeenCalled()
    })
  })

  it('handles file removal', async () => {
    const user = userEvent.setup()
    renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

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

    it('validates invalid JSON in response schema', async () => {
      const user = userEvent.setup()
      renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

      // Fill required fields
      await user.type(screen.getByPlaceholderText(/Enter agent name/i), 'Test Agent')
      await user.type(screen.getByPlaceholderText(/Natural language instructions/i), 'Test prompt')

      // Add invalid JSON using paste
      const schemaEditor = screen.getByLabelText('Response schema editor')
      await user.click(schemaEditor)
      await user.paste('{invalid json}')

      // Submit form
      fireEvent.submit(screen.getByTestId('ai-agent-node-form'))

      await waitFor(() => {
        expect(screen.getByText(/Invalid JSON/i)).toBeInTheDocument()
        expect(mockOnSubmit).not.toHaveBeenCalled()
      })
    })

    it('validates response schema must be an object', async () => {
      const user = userEvent.setup()
      renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

      // Fill required fields
      await user.type(screen.getByPlaceholderText(/Enter agent name/i), 'Test Agent')
      await user.type(screen.getByPlaceholderText(/Natural language instructions/i), 'Test prompt')

      // Add array instead of object using paste
      const schemaEditor = screen.getByLabelText('Response schema editor')
      await user.click(schemaEditor)
      await user.paste('["item1", "item2"]')

      // Submit form
      fireEvent.submit(screen.getByTestId('ai-agent-node-form'))

      await waitFor(() => {
        expect(screen.getByText(/Response schema must be a JSON object/i)).toBeInTheDocument()
        expect(mockOnSubmit).not.toHaveBeenCalled()
      })
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

    it('has no accessibility violations with validation error (excluding known PatternFly Tabs issue)', async () => {
      const user = userEvent.setup()
      const { container } = renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

      // Fill required fields
      await user.type(screen.getByPlaceholderText(/Enter agent name/i), 'Test Agent')
      await user.type(screen.getByPlaceholderText(/Natural language instructions/i), 'Test prompt')

      // Add invalid JSON using paste
      const schemaEditor = screen.getByLabelText('Response schema editor')
      await user.click(schemaEditor)
      await user.paste('{invalid}')

      // Submit to trigger validation
      fireEvent.submit(screen.getByTestId('ai-agent-node-form'))

      await waitFor(() => {
        expect(screen.getByText(/Invalid JSON/i)).toBeInTheDocument()
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
