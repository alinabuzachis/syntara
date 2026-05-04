import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { credentialsClient } from '../../../client'

import { ActionNodeForm } from './ActionNodeForm'
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

// Mock ExpandableCodeEditor to use a simple textarea for testing
vi.mock('../../../components/ExpandableCodeEditor', () => ({
  ExpandableCodeEditor: ({
    code,
    onCodeChange,
    ariaLabel,
  }: {
    code: string
    onCodeChange: (code: string) => void
    ariaLabel?: string
  }) => (
    <textarea
      data-testid="code-editor"
      value={code}
      onChange={(e) => onCodeChange(e.target.value)}
      aria-label={ariaLabel}
      placeholder="Enter your code..."
    />
  ),
}))

describe('ActionNodeForm', () => {
  const mockOnSubmit = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders script fields by default and hides the action type selector', () => {
    renderWithHeader(<ActionNodeForm onSubmit={mockOnSubmit} />)

    expect(screen.queryByLabelText(/Action type/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Language/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Script code editor/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/URL/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/HTTP Method/i)).not.toBeInTheDocument()
  })

  it('shows "Script is required" when submitting with empty script', async () => {
    const user = userEvent.setup()
    renderWithHeader(<ActionNodeForm onSubmit={mockOnSubmit} />)

    await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Test Script')
    fireEvent.submit(screen.getByTestId('action-node-form'))

    await waitFor(() => {
      expect(screen.getByText('Script is required')).toBeInTheDocument()
      expect(mockOnSubmit).not.toHaveBeenCalled()
    })
  })

  it('renders API fields when initialData sets executor to api', () => {
    renderWithHeader(<ActionNodeForm onSubmit={mockOnSubmit} initialData={{ executor: 'http_request' }} />)

    expect(screen.queryByLabelText(/Action type/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/URL/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/HTTP Method/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Language/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Script code editor/i)).not.toBeInTheDocument()
  })

  it('populates form with initial data for script executor', () => {
    renderWithHeader(
      <ActionNodeForm
        onSubmit={mockOnSubmit}
        initialData={{
          name: 'Existing Script',
          executor: 'script',
          language: 'bash',
          code: 'echo "hello"',
          parameters: '{"param": "value"}',
        }}
      />
    )

    expect(screen.getByDisplayValue('Existing Script')).toBeInTheDocument()
    expect(screen.getByDisplayValue('echo "hello"')).toBeInTheDocument()
    expect(screen.getByDisplayValue('{"param": "value"}')).toBeInTheDocument()
    expect(screen.getByLabelText(/Language/i)).toHaveValue('bash')
  })

  it('populates form with initial data for API executor', () => {
    renderWithHeader(
      <ActionNodeForm
        onSubmit={mockOnSubmit}
        initialData={{
          name: 'Existing API',
          executor: 'http_request',
          method: 'POST',
          url: 'https://example.com/api',
          headers: '{"X-Custom": "header"}',
          body: '{"data": "test"}',
        }}
      />
    )

    expect(screen.getByDisplayValue('Existing API')).toBeInTheDocument()
    expect(screen.getByDisplayValue('https://example.com/api')).toBeInTheDocument()
    expect(screen.getByDisplayValue('{"X-Custom": "header"}')).toBeInTheDocument()
    expect(screen.getByDisplayValue('{"data": "test"}')).toBeInTheDocument()
  })

  it('passes projectId to CredentialSelector for HTTP request executor', () => {
    const useQueryMock = vi.mocked(credentialsClient.useQuery)
    useQueryMock.mockClear()

    renderWithHeader(
      <ActionNodeForm onSubmit={mockOnSubmit} initialData={{ executor: 'http_request' }} projectId="project-123" />
    )

    const hasProjectIdCall = useQueryMock.mock.calls.some((call) => {
      const params = (call[2] as unknown as { params?: { query?: Record<string, unknown> } })?.params?.query
      return params?.project_id === 'project-123'
    })
    expect(hasProjectIdCall).toBe(true)
  })

  it('validates URL field for API executor', () => {
    renderWithHeader(<ActionNodeForm onSubmit={mockOnSubmit} initialData={{ executor: 'http_request' }} />)

    expect(screen.getByPlaceholderText(/https:\/\/api.example.com/i)).toHaveAttribute('type', 'url')
  })

  it('submits script form data', async () => {
    const user = userEvent.setup()
    renderWithHeader(<ActionNodeForm onSubmit={mockOnSubmit} />)

    await user.type(screen.getByPlaceholderText(/Enter your code/i), 'print("hello")')
    fireEvent.submit(screen.getByTestId('action-node-form'))

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '',
          executor: 'script',
          language: 'python',
          code: 'print("hello")',
        })
      )
    })
  })

  it('submits API form data', async () => {
    const user = userEvent.setup()
    renderWithHeader(<ActionNodeForm onSubmit={mockOnSubmit} initialData={{ executor: 'http_request' }} />)

    await user.type(screen.getByPlaceholderText(/https:\/\/api.example.com/i), 'https://api.test.com/data')
    await user.selectOptions(screen.getByLabelText(/HTTP Method/i), 'POST')
    fireEvent.submit(screen.getByTestId('action-node-form'))

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '',
          executor: 'http_request',
          method: 'POST',
          url: 'https://api.test.com/data',
        })
      )
    })
  })

  it('allows changing language for script executor', async () => {
    const user = userEvent.setup()
    renderWithHeader(<ActionNodeForm onSubmit={mockOnSubmit} />)

    await user.selectOptions(screen.getByLabelText(/Language/i), 'bash')
    await user.type(screen.getByPlaceholderText(/Enter your code/i), 'echo "test"')
    fireEvent.submit(screen.getByTestId('action-node-form'))

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          language: 'bash',
        })
      )
    })
  })

  it('includes parameters in submission when provided', async () => {
    const user = userEvent.setup()
    renderWithHeader(<ActionNodeForm onSubmit={mockOnSubmit} />)

    await user.type(screen.getByPlaceholderText(/Enter your code/i), 'code')
    const paramsInput = screen.getByPlaceholderText('{"key": "value"}')
    await user.click(paramsInput)
    await user.paste('{"test": 123}')
    fireEvent.submit(screen.getByTestId('action-node-form'))

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: '{"test": 123}',
        })
      )
    })
  })

  it('renders code editor with drop support for script executor', () => {
    renderWithHeader(<ActionNodeForm onSubmit={mockOnSubmit} />)

    expect(screen.getByTestId('code-editor')).toBeInTheDocument()
  })
})
