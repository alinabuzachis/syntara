import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AAPNodeForm } from './AAPNodeForm'
import { renderWithHeader } from './test-utils/renderWithHeader'

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
  })

  it('renders form with required fields', () => {
    renderWithHeader(<AAPNodeForm onSubmit={mockOnSubmit} onCancel={vi.fn()} onHeaderContentChange={vi.fn()} />)

    expect(screen.getByLabelText(/Name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Job Template ID/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Inventory ID/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Credentials/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Extra Variables/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Limit/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Tags$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Skip Tags/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Verbosity/i)).toBeInTheDocument()
  })

  it('submits minimal valid form with only required fields', async () => {
    const user = userEvent.setup()
    renderWithHeader(<AAPNodeForm onSubmit={mockOnSubmit} onCancel={vi.fn()} onHeaderContentChange={vi.fn()} />)

    await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Test Job')
    await user.type(screen.getByPlaceholderText('123'), '456')
    await user.click(screen.getByRole('button', { name: /Add node/i }))

    expect(mockOnSubmit).toHaveBeenCalledWith({
      name: 'Test Job',
      jobTemplateId: '456',
      inventory: '',
      credentials: '',
      extraVars: '',
      limit: '',
      tags: '',
      skipTags: '',
      verbosity: '',
    })
  })

  it('submits with all optional fields', async () => {
    const user = userEvent.setup()
    renderWithHeader(<AAPNodeForm onSubmit={mockOnSubmit} onCancel={vi.fn()} onHeaderContentChange={vi.fn()} />)

    await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Test Job')
    await user.type(screen.getByPlaceholderText('123'), '456')
    await user.type(screen.getByPlaceholderText('456'), '789')
    await user.type(screen.getByPlaceholderText('1,2,3'), '10,20,30')
    await user.click(screen.getByPlaceholderText(/version/i))
    await user.paste('{"key": "value"}')
    await user.type(screen.getByPlaceholderText(/webservers/i), 'webservers:dbservers')
    await user.type(screen.getByPlaceholderText(/install,configure/i), 'install,configure')
    await user.type(screen.getByPlaceholderText(/testing,debug/i), 'testing,debug')
    await user.selectOptions(screen.getByLabelText(/Verbosity/i), '3')
    await user.click(screen.getByRole('button', { name: /Add node/i }))

    expect(mockOnSubmit).toHaveBeenCalledWith({
      name: 'Test Job',
      jobTemplateId: '456',
      inventory: '789',
      credentials: '10,20,30',
      extraVars: '{"key": "value"}',
      limit: 'webservers:dbservers',
      tags: 'install,configure',
      skipTags: 'testing,debug',
      verbosity: '3',
    })
  })

  it('does not submit when extra vars JSON is invalid', async () => {
    const user = userEvent.setup()
    renderWithHeader(<AAPNodeForm onSubmit={mockOnSubmit} onCancel={vi.fn()} onHeaderContentChange={vi.fn()} />)

    await user.type(screen.getByPlaceholderText('123'), '456')
    const extraVarsInput = screen.getByPlaceholderText(/version/i)
    await user.click(extraVarsInput)
    await user.paste('invalid json')
    await user.click(screen.getByRole('button', { name: /Add node/i }))

    expect(mockOnSubmit).not.toHaveBeenCalled()
  })

  it('shows "Invalid JSON format" helper text after submit with invalid extra vars', async () => {
    const user = userEvent.setup()
    renderWithHeader(<AAPNodeForm onSubmit={mockOnSubmit} onCancel={vi.fn()} onHeaderContentChange={vi.fn()} />)

    await user.type(screen.getByPlaceholderText('123'), '456')
    const extraVarsInput = screen.getByPlaceholderText(/version/i)
    await user.click(extraVarsInput)
    await user.paste('not valid json')
    await user.click(screen.getByRole('button', { name: /Add node/i }))

    await waitFor(() => {
      expect(screen.getByText('Invalid JSON format')).toBeInTheDocument()
    })
  })

  it('shows "Invalid JSON format" helper text on blur when extra vars is invalid', async () => {
    const user = userEvent.setup()
    renderWithHeader(<AAPNodeForm onSubmit={mockOnSubmit} onCancel={vi.fn()} onHeaderContentChange={vi.fn()} />)

    await user.type(screen.getByPlaceholderText('123'), '456')
    const extraVarsInput = screen.getByPlaceholderText(/version/i)
    await user.click(extraVarsInput)
    await user.paste('bad json')
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText('Invalid JSON format')).toBeInTheDocument()
    })
  })

  it('submits when extra vars JSON is fixed after being invalid', async () => {
    const user = userEvent.setup()
    renderWithHeader(<AAPNodeForm onSubmit={mockOnSubmit} onCancel={vi.fn()} onHeaderContentChange={vi.fn()} />)

    await user.type(screen.getByPlaceholderText('123'), '456')
    const extraVarsInput = screen.getByPlaceholderText(/version/i)
    await user.click(extraVarsInput)
    await user.paste('bad json')
    await user.click(screen.getByRole('button', { name: /Add node/i }))
    expect(mockOnSubmit).not.toHaveBeenCalled()

    await user.clear(extraVarsInput)
    await user.paste('{"key": "value"}')
    const form = document.getElementById('aap-node-form')
    expect(form).toBeInstanceOf(HTMLFormElement)
    ;(form as HTMLFormElement).requestSubmit()
    await waitFor(() => expect(mockOnSubmit).toHaveBeenCalled())
  })

  it('populates form with initial data', () => {
    renderWithHeader(
      <AAPNodeForm
        onSubmit={mockOnSubmit}
        onCancel={vi.fn()}
        onHeaderContentChange={vi.fn()}
        initialData={{
          name: 'Existing Job',
          jobTemplateId: '123',
          inventory: '456',
          credentials: '1,2,3',
          extraVars: '{"env": "prod"}',
          limit: 'webservers',
          tags: 'deploy',
          skipTags: 'testing',
          verbosity: '2',
        }}
      />
    )

    expect(screen.getByDisplayValue('Existing Job')).toBeInTheDocument()
    expect(screen.getByDisplayValue('123')).toBeInTheDocument()
    expect(screen.getByDisplayValue('456')).toBeInTheDocument()
    expect(screen.getByDisplayValue('1,2,3')).toBeInTheDocument()
    expect(screen.getByDisplayValue('{"env": "prod"}')).toBeInTheDocument()
    expect(screen.getByDisplayValue('webservers')).toBeInTheDocument()
    expect(screen.getByDisplayValue('deploy')).toBeInTheDocument()
    expect(screen.getByDisplayValue('testing')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2 - More Verbose')).toBeInTheDocument()
  })

  it('uses custom submit button text when provided', () => {
    renderWithHeader(
      <AAPNodeForm
        onSubmit={mockOnSubmit}
        onCancel={vi.fn()}
        onHeaderContentChange={vi.fn()}
        submitButtonText="Update node"
      />
    )

    expect(screen.getByRole('button', { name: /Update node/i })).toBeInTheDocument()
  })
})
