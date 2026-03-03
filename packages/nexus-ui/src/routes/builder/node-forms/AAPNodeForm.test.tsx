import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AAPNodeForm } from './AAPNodeForm'
import { renderWithHeader } from './test-utils/renderWithHeader'

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
      data-testid="extra-vars-editor"
      id="aap-extraVars"
      value={code}
      onChange={(e) => onCodeChange(e.target.value)}
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
    renderWithHeader(<AAPNodeForm onSubmit={mockOnSubmit} onHeaderContentChange={vi.fn()} />)

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
    renderWithHeader(<AAPNodeForm onSubmit={mockOnSubmit} onHeaderContentChange={vi.fn()} />)

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
    renderWithHeader(<AAPNodeForm onSubmit={mockOnSubmit} onHeaderContentChange={vi.fn()} />)

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

  it('validates JSON and disables submit on invalid input', async () => {
    const user = userEvent.setup()
    renderWithHeader(<AAPNodeForm onSubmit={mockOnSubmit} onHeaderContentChange={vi.fn()} />)

    const extraVarsInput = screen.getByPlaceholderText(/version/i)
    await user.click(extraVarsInput)
    await user.paste('invalid json')

    expect(await screen.findByText(/Invalid JSON format/i)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Add node/i })).toBeDisabled()
  })

  it('clears validation error when JSON input is cleared', async () => {
    const user = userEvent.setup()
    renderWithHeader(<AAPNodeForm onSubmit={mockOnSubmit} onHeaderContentChange={vi.fn()} />)

    const extraVarsInput = screen.getByPlaceholderText(/version/i)
    await user.click(extraVarsInput)
    await user.paste('bad json')
    expect(await screen.findByText(/Invalid JSON format/i)).toBeInTheDocument()

    await user.clear(extraVarsInput)
    expect(screen.queryByText(/Invalid JSON format/i)).not.toBeInTheDocument()
  })

  it('populates form with initial data', () => {
    renderWithHeader(
      <AAPNodeForm
        onSubmit={mockOnSubmit}
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
      <AAPNodeForm onSubmit={mockOnSubmit} onHeaderContentChange={vi.fn()} submitButtonText="Update node" />
    )

    expect(screen.getByRole('button', { name: /Update node/i })).toBeInTheDocument()
  })
})
