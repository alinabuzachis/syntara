import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { AAPNodeForm } from './AAPNodeForm'

// Mock components from nexus-ui-framework
vi.mock('@ansible/nexus-ui-framework', async () => {
  const actual = await vi.importActual('@ansible/nexus-ui-framework')
  return {
    ...actual,
    Button: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
      <button {...props}>{children}</button>
    ),
  }
})

describe('AAPNodeForm', () => {
  const mockOnSubmit = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders form with all AAP operations', () => {
    render(<AAPNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

    const select = screen.getByRole('combobox') as HTMLSelectElement
    const options = Array.from(select.options).map((opt) => opt.value)

    expect(options).toEqual(['launch_job', 'launch_workflow', 'get_job_status', 'cancel_job'])
  })

  it('submits minimal valid form', async () => {
    const user = userEvent.setup()
    render(<AAPNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

    await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Test Job')
    await user.type(screen.getByPlaceholderText(/ansible-automation-platform/i), 'ansible-automation-platform')
    await user.click(screen.getByRole('button', { name: /Add node/i }))

    expect(mockOnSubmit).toHaveBeenCalledWith({
      name: 'Test Job',
      connectorId: 'ansible-automation-platform',
      operation: 'launch_job',
      parameters: '',
    })
  })

  it('submits with different operation', async () => {
    const user = userEvent.setup()
    render(<AAPNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

    await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Cancel Job')
    await user.type(screen.getByPlaceholderText(/ansible-automation-platform/i), 'ansible-automation-platform')
    await user.selectOptions(screen.getByRole('combobox'), 'cancel_job')
    await user.click(screen.getByRole('button', { name: /Add node/i }))

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'cancel_job',
      })
    )
  })

  it('validates JSON and disables submit on invalid input', async () => {
    const user = userEvent.setup()
    render(<AAPNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

    const paramsInput = screen.getByPlaceholderText(/job_template_id/i)
    await user.click(paramsInput)
    await user.paste('invalid json')

    expect(await screen.findByText(/Invalid JSON format/i)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Add node/i })).toBeDisabled()
  })

  it('clears validation error when input is cleared', async () => {
    const user = userEvent.setup()
    render(<AAPNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

    const paramsInput = screen.getByPlaceholderText(/job_template_id/i)
    await user.click(paramsInput)
    await user.paste('bad json')
    expect(await screen.findByText(/Invalid JSON format/i)).toBeInTheDocument()

    await user.clear(paramsInput)
    expect(screen.queryByText(/Invalid JSON format/i)).not.toBeInTheDocument()
  })
})
