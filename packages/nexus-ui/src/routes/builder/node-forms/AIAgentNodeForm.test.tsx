import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { credentialsClient } from '../../../client'

import { AIAgentNodeForm } from './AIAgentNodeForm'
import { renderWithHeader } from './test-utils/renderWithHeader'

// Mock credentialsClient used by CredentialSelector
vi.mock('../../../client', () => ({
  credentialsClient: {
    useQuery: vi.fn().mockReturnValue({
      data: { resources: [] },
      isPending: false,
      error: null,
      refetch: vi.fn(),
    }),
    useMutation: vi.fn().mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    }),
  },
}))

// Mock file upload hook
const mockUploadFiles = vi.fn()
vi.mock('../../../hooks/useFileUploadWithProgress', () => ({
  useFileUploadWithProgress: () => ({
    uploadFiles: mockUploadFiles,
    progress: [],
    error: null,
  }),
}))

// Mock FileUpload component to expose file selection handler
vi.mock('../../../components/file-upload', () => ({
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

describe('AIAgentNodeForm', () => {
  const mockOnSubmit = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUploadFiles.mockResolvedValue({
      files: [{ file_id: 'server-file-123', filename: 'test.txt', size_bytes: 4 }],
    })
  })

  it('renders form with all fields', () => {
    renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText(/Prompt/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Tools/i)).toBeInTheDocument()
  })

  it('submits form with minimal required fields', async () => {
    const user = userEvent.setup()
    renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

    await user.type(screen.getByPlaceholderText(/Enter agent name/i), 'Test Agent')
    await user.type(screen.getByPlaceholderText(/Natural language instructions/i), 'Test prompt')
    await user.click(screen.getByRole('button', { name: /Add step/i }))

    expect(mockOnSubmit).toHaveBeenCalledWith({
      name: 'Test Agent',
      model: 'anthropic/claude-haiku-4.5',
      prompt: 'Test prompt',
      tools: '',
      fileIds: [],
    })
  })

  it('shows "Prompt is required" when submitting with empty prompt', async () => {
    const user = userEvent.setup()
    renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

    await user.type(screen.getByPlaceholderText(/Enter agent name/i), 'Test Agent')
    await user.click(screen.getByRole('button', { name: /Add step/i }))

    await waitFor(() => {
      expect(screen.getByText('Prompt is required')).toBeInTheDocument()
    })
    expect(mockOnSubmit).not.toHaveBeenCalled()
  })

  it('submits form with required fields and default model', async () => {
    const user = userEvent.setup()
    renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

    await user.type(screen.getByPlaceholderText(/Enter agent name/i), 'Research Agent')
    await user.type(
      screen.getByPlaceholderText(/Natural language instructions/i),
      'Research the topic and provide a summary'
    )
    await user.click(screen.getByRole('button', { name: /Add step/i }))

    expect(mockOnSubmit).toHaveBeenCalledWith({
      name: 'Research Agent',
      model: 'anthropic/claude-haiku-4.5',
      prompt: 'Research the topic and provide a summary',
      tools: '',
      fileIds: [],
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
          tools: 'calculator, web_search',
        }}
      />
    )

    expect(screen.getByDisplayValue('Existing Agent')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Analyze the data')).toBeInTheDocument()
    expect(screen.getByDisplayValue('All tools selected')).toBeInTheDocument()
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

  it('uses custom submit button text when provided', () => {
    renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} submitButtonText="Update step" />)

    expect(screen.getByRole('button', { name: /Update step/i })).toBeInTheDocument()
  })

  it('has disabled tools dropdown', () => {
    renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

    const toolsDropdown = screen.getByLabelText(/Tools/i)
    expect(toolsDropdown).toBeDisabled()
  })

  it('submits with default model from environment', async () => {
    const user = userEvent.setup()
    renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

    await user.type(screen.getByPlaceholderText(/Enter agent name/i), 'Test Agent')
    await user.type(screen.getByPlaceholderText(/Natural language instructions/i), 'Test prompt')
    await user.click(screen.getByRole('button', { name: /Add step/i }))

    // Verify model is included with default value
    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'anthropic/claude-haiku-4.5',
      })
    )
  })

  it('preserves model from initial data when updating', async () => {
    const user = userEvent.setup()
    renderWithHeader(
      <AIAgentNodeForm
        onSubmit={mockOnSubmit}
        initialData={{
          name: 'Existing Agent',
          model: 'custom-model',
          prompt: 'Test',
          tools: '',
        }}
      />
    )

    await user.click(screen.getByRole('button', { name: /Add step/i }))

    // Verify custom model is preserved
    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'custom-model',
      })
    )
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

  it('submits with uploaded file IDs', async () => {
    const user = userEvent.setup()
    renderWithHeader(<AIAgentNodeForm onSubmit={mockOnSubmit} />)

    // Upload a file
    await user.click(screen.getByTestId('upload-files'))

    // Wait for upload to complete
    await waitFor(() => {
      expect(mockUploadFiles).toHaveBeenCalled()
    })

    // Fill in required fields
    await user.type(screen.getByPlaceholderText(/Enter agent name/i), 'Agent with File')
    await user.type(screen.getByPlaceholderText(/Natural language instructions/i), 'Process the file')

    // Submit
    await user.click(screen.getByRole('button', { name: /Add step/i }))

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Agent with File',
        fileIds: ['server-file-123'],
      })
    )
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
})
