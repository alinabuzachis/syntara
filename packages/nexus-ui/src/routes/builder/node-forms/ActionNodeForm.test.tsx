import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { ActionNodeForm } from './ActionNodeForm'

describe('ActionNodeForm', () => {
  const mockOnSubmit = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders form with script fields by default', () => {
    render(<ActionNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

    expect(screen.getByLabelText(/Action type/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Enter activity name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Language/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Enter your code/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('{"key": "value"}')).toBeInTheDocument()
  })

  it('submits script form data', async () => {
    const user = userEvent.setup()
    render(<ActionNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

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

  it('switches to API executor and shows API fields', async () => {
    const user = userEvent.setup()
    render(<ActionNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

    await user.selectOptions(screen.getByLabelText(/Action type/i), 'api')

    expect(screen.getByPlaceholderText(/https:\/\/api.example.com/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/HTTP Method/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Bearer token/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Content-Type/i)).toBeInTheDocument()
  })

  it('submits API form data', async () => {
    const user = userEvent.setup()
    render(<ActionNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

    await user.selectOptions(screen.getByLabelText(/Action type/i), 'api')
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

  it('cleans up data when switching executor types', async () => {
    const user = userEvent.setup()
    render(<ActionNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

    // Fill out script fields
    await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Test Action')
    await user.type(screen.getByPlaceholderText(/Enter your code/i), 'some code')

    // Switch to API and fill URL
    await user.selectOptions(screen.getByLabelText(/Action type/i), 'api')
    await user.type(screen.getByPlaceholderText(/https:\/\/api.example.com/i), 'https://api.test.com')

    await user.click(screen.getByRole('button', { name: /Add node/i }))

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        executor: 'api',
        // Script fields should be undefined
        language: undefined,
        code: undefined,
        // API fields should be present
        url: 'https://api.test.com',
        method: 'GET',
      })
    )
  })

  it('populates form with initial data for script executor', () => {
    render(
      <ActionNodeForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
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
    render(
      <ActionNodeForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
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
    render(<ActionNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} submitButtonText="Update node" />)

    expect(screen.getByRole('button', { name: /Update node/i })).toBeInTheDocument()
  })

  it('has code field for script executor', () => {
    render(<ActionNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

    // The Code field should exist for script executor
    expect(screen.getByPlaceholderText(/Enter your code/i)).toBeInTheDocument()
  })

  it('validates URL field for API executor', async () => {
    const user = userEvent.setup()
    render(<ActionNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

    await user.selectOptions(screen.getByLabelText(/Action type/i), 'api')
    await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Test')

    // URL field should be required
    expect(screen.getByPlaceholderText(/https:\/\/api.example.com/i)).toHaveAttribute('type', 'url')
  })

  it('allows changing language for script executor', async () => {
    const user = userEvent.setup()
    render(<ActionNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

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
    render(<ActionNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

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
