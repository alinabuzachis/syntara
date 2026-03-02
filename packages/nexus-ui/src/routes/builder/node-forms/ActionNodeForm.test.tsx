import { render, screen } from '@testing-library/react'
import { renderWithHeader } from './test-utils/renderWithHeader'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ActionNodeForm } from './ActionNodeForm'

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

  it('submits script form data', async () => {
    const user = userEvent.setup()
    renderWithHeader(<ActionNodeForm onSubmit={mockOnSubmit} />)

    await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Test Script')
    await user.type(screen.getByPlaceholderText(/Enter your code/i), 'print("hello")')
    await user.click(screen.getByRole('button', { name: /Add node/i }))

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Test Script',
        executor: 'script',
        language: 'python',
        code: 'print("hello")',
      })
    )
  })

  it('renders API fields when initialData sets executor to api', () => {
    renderWithHeader(<ActionNodeForm onSubmit={mockOnSubmit} initialData={{ executor: 'api' }} />)

    expect(screen.queryByLabelText(/Action type/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/URL/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/HTTP Method/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Language/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Script code editor/i)).not.toBeInTheDocument()
  })

  it('submits API form data', async () => {
    const user = userEvent.setup()
    renderWithHeader(<ActionNodeForm onSubmit={mockOnSubmit} initialData={{ executor: 'api' }} />)

    await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Test API')
    await user.type(screen.getByPlaceholderText(/https:\/\/api.example.com/i), 'https://api.test.com/data')
    await user.selectOptions(screen.getByLabelText(/HTTP Method/i), 'POST')
    await user.type(screen.getByPlaceholderText(/Bearer token/i), 'my-secret-token')
    await user.click(screen.getByRole('button', { name: /Add node/i }))

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Test API',
        executor: 'api',
        method: 'POST',
        url: 'https://api.test.com/data',
        authentication: 'my-secret-token',
      })
    )
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
          executor: 'api',
          method: 'POST',
          url: 'https://example.com/api',
          authentication: 'Bearer token123',
          headers: '{"X-Custom": "header"}',
          body: '{"data": "test"}',
        }}
      />
    )

    expect(screen.getByDisplayValue('Existing API')).toBeInTheDocument()
    expect(screen.getByDisplayValue('https://example.com/api')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Bearer token123')).toBeInTheDocument()
    expect(screen.getByDisplayValue('{"X-Custom": "header"}')).toBeInTheDocument()
    expect(screen.getByDisplayValue('{"data": "test"}')).toBeInTheDocument()
  })

  it('uses custom submit button text when provided', () => {
    renderWithHeader(<ActionNodeForm onSubmit={mockOnSubmit} submitButtonText="Update node" />)

    expect(screen.getByRole('button', { name: /Update node/i })).toBeInTheDocument()
  })

  it('validates URL field for API executor', () => {
    renderWithHeader(<ActionNodeForm onSubmit={mockOnSubmit} initialData={{ executor: 'api' }} />)

    expect(screen.getByPlaceholderText(/https:\/\/api.example.com/i)).toHaveAttribute('type', 'url')
  })

  it('allows changing language for script executor', async () => {
    const user = userEvent.setup()
    renderWithHeader(<ActionNodeForm onSubmit={mockOnSubmit} />)

    await user.selectOptions(screen.getByLabelText(/Language/i), 'bash')
    await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Bash Script')
    await user.type(screen.getByPlaceholderText(/Enter your code/i), 'echo "test"')
    await user.click(screen.getByRole('button', { name: /Add node/i }))

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        language: 'bash',
      })
    )
  })

  it('includes parameters in submission when provided', async () => {
    const user = userEvent.setup()
    renderWithHeader(<ActionNodeForm onSubmit={mockOnSubmit} />)

    await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Test')
    await user.type(screen.getByPlaceholderText(/Enter your code/i), 'code')
    const paramsInput = screen.getByPlaceholderText('{"key": "value"}')
    await user.click(paramsInput)
    await user.paste('{"test": 123}')
    await user.click(screen.getByRole('button', { name: /Add node/i }))

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        parameters: '{"test": 123}',
      })
    )
  })
})
