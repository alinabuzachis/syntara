import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { AIAgentNodeForm } from './AIAgentNodeForm'

describe('AIAgentNodeForm', () => {
  const mockOnSubmit = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders form with all fields', () => {
    render(<AIAgentNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

    expect(screen.getByLabelText(/Agent name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Prompt/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Tools/i)).toBeInTheDocument()
  })

  it('submits form with minimal required fields', async () => {
    const user = userEvent.setup()
    render(<AIAgentNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

    await user.type(screen.getByPlaceholderText(/Enter agent name/i), 'Test Agent')
    await user.type(screen.getByPlaceholderText(/Natural language instructions/i), 'Test prompt')
    await user.click(screen.getByRole('button', { name: /Add node/i }))

    expect(mockOnSubmit).toHaveBeenCalledWith({
      name: 'Test Agent',
      model: 'anthropic/claude-3.5-sonnet',
      prompt: 'Test prompt',
      tools: '',
    })
  })

  it('submits form with required fields and default model', async () => {
    const user = userEvent.setup()
    render(<AIAgentNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

    await user.type(screen.getByPlaceholderText(/Enter agent name/i), 'Research Agent')
    await user.type(
      screen.getByPlaceholderText(/Natural language instructions/i),
      'Research the topic and provide a summary'
    )
    await user.click(screen.getByRole('button', { name: /Add node/i }))

    expect(mockOnSubmit).toHaveBeenCalledWith({
      name: 'Research Agent',
      model: 'anthropic/claude-3.5-sonnet',
      prompt: 'Research the topic and provide a summary',
      tools: '',
    })
  })

  it('populates form with initial data', () => {
    render(
      <AIAgentNodeForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        initialData={{
          name: 'Existing Agent',
          model: 'anthropic/claude-3.5-sonnet',
          prompt: 'Analyze the data',
          tools: 'calculator, web_search',
        }}
      />
    )

    expect(screen.getByDisplayValue('Existing Agent')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Analyze the data')).toBeInTheDocument()
    expect(screen.getByDisplayValue('All tools selected')).toBeInTheDocument()
  })

  it('uses custom submit button text when provided', () => {
    render(<AIAgentNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} submitButtonText="Update node" />)

    expect(screen.getByRole('button', { name: /Update node/i })).toBeInTheDocument()
  })

  it('has disabled tools dropdown', () => {
    render(<AIAgentNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

    const toolsDropdown = screen.getByLabelText(/Tools/i)
    expect(toolsDropdown).toBeDisabled()
  })

  it('submits with default model from environment', async () => {
    const user = userEvent.setup()
    render(<AIAgentNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

    await user.type(screen.getByPlaceholderText(/Enter agent name/i), 'Test Agent')
    await user.type(screen.getByPlaceholderText(/Natural language instructions/i), 'Test prompt')
    await user.click(screen.getByRole('button', { name: /Add node/i }))

    // Verify model is included with default value
    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'anthropic/claude-3.5-sonnet',
      })
    )
  })

  it('preserves model from initial data when updating', async () => {
    const user = userEvent.setup()
    render(
      <AIAgentNodeForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        initialData={{
          name: 'Existing Agent',
          model: 'custom-model',
          prompt: 'Test',
          tools: '',
        }}
      />
    )

    await user.click(screen.getByRole('button', { name: /Add node/i }))

    // Verify custom model is preserved
    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'custom-model',
      })
    )
  })
})
