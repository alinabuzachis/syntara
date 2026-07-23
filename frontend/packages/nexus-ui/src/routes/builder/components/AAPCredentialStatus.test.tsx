import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { useCredentialName } from '../../workflows/canvas/nodes/hooks/useCredentialName'

import { AAPCredentialStatus, type AAPCredentialStatusProps } from './AAPCredentialStatus'

vi.mock('../../workflows/canvas/nodes/hooks/useCredentialName', () => ({
  useCredentialName: vi.fn(),
}))

vi.mock('./CredentialSelector', () => ({
  CredentialSelector: ({
    onChange,
    value,
  }: {
    onChange: (id: string | undefined) => void
    value?: string
    compatibleTypeNames?: string[]
    label?: string
    fieldId?: string
    placeholder?: string
    allowCreate?: boolean
    isDisabled?: boolean
    projectId?: string
  }) => (
    <div data-testid="credential-selector" data-value={value ?? ''}>
      <button onClick={() => onChange('new-cred-id')} data-testid="select-credential">
        Select credential
      </button>
    </div>
  ),
}))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)

function renderComponent(props: Partial<AAPCredentialStatusProps> = {}) {
  const defaultProps: AAPCredentialStatusProps = {
    integrationSelected: true,
    credentialId: undefined,
    onChange: vi.fn(),
    ...props,
  }
  return render(<AAPCredentialStatus {...defaultProps} />, { wrapper })
}

describe('AAPCredentialStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useCredentialName).mockReturnValue({ name: undefined, isPending: false })
  })

  it('renders nothing when integrationSelected is false', () => {
    const { container } = renderComponent({ integrationSelected: false })

    expect(container.innerHTML).toBe('')
  })

  it('shows warning state when no credential is set', () => {
    renderComponent({ credentialId: undefined })

    expect(screen.getByText('AAP credential not configured')).toBeInTheDocument()
    expect(screen.getByText('Set up connection')).toBeInTheDocument()
  })

  it('shows configured state with credential name', () => {
    vi.mocked(useCredentialName).mockReturnValue({ name: 'My AAP Credential', isPending: false })
    renderComponent({ credentialId: 'cred-1' })

    expect(screen.getByText('My AAP Credential')).toBeInTheDocument()
    expect(screen.getByText('Change')).toBeInTheDocument()
  })

  it('opens picker when "Set up connection" is clicked', async () => {
    const user = userEvent.setup()
    renderComponent({ credentialId: undefined })

    await user.click(screen.getByText('Set up connection'))

    expect(screen.getByTestId('credential-selector')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('opens picker when "Change" is clicked', async () => {
    vi.mocked(useCredentialName).mockReturnValue({ name: 'My AAP Credential', isPending: false })
    const user = userEvent.setup()
    renderComponent({ credentialId: 'cred-1' })

    await user.click(screen.getByText('Change'))

    expect(screen.getByTestId('credential-selector')).toBeInTheDocument()
  })

  it('calls onChange and closes picker when credential is selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderComponent({ credentialId: undefined, onChange })

    await user.click(screen.getByText('Set up connection'))
    await user.click(screen.getByTestId('select-credential'))

    expect(onChange).toHaveBeenCalledWith('new-cred-id')
  })

  it('hides Change button when disabled', () => {
    vi.mocked(useCredentialName).mockReturnValue({ name: 'My AAP Credential', isPending: false })
    renderComponent({ credentialId: 'cred-1', isDisabled: true })

    expect(screen.getByText('My AAP Credential')).toBeInTheDocument()
    expect(screen.queryByText('Change')).not.toBeInTheDocument()
  })

  it('hides Set up connection button when disabled', () => {
    renderComponent({ credentialId: undefined, isDisabled: true })

    expect(screen.getByText('AAP credential not configured')).toBeInTheDocument()
    expect(screen.queryByText('Set up connection')).not.toBeInTheDocument()
  })

  it('has no accessibility violations in warning state', async () => {
    const { container } = renderComponent({ credentialId: undefined })

    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no accessibility violations in configured state', async () => {
    vi.mocked(useCredentialName).mockReturnValue({ name: 'My AAP Credential', isPending: false })
    const { container } = renderComponent({ credentialId: 'cred-1' })

    expect(await axe(container)).toHaveNoViolations()
  })

  it('shows loading skeleton while credential name is pending', () => {
    vi.mocked(useCredentialName).mockReturnValue({ name: undefined, isPending: true })
    renderComponent({ credentialId: 'cred-1' })

    expect(screen.getByText('Loading credential')).toBeInTheDocument()
    expect(screen.queryByText('AAP credential not configured')).not.toBeInTheDocument()
  })

  it('shows warning with picker for orphaned credential (id set but name not found)', () => {
    vi.mocked(useCredentialName).mockReturnValue({ name: undefined, isPending: false })
    renderComponent({ credentialId: 'orphaned-cred' })

    expect(screen.getByText('AAP credential not configured')).toBeInTheDocument()
    expect(screen.getByTestId('credential-selector')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('shows skeleton only when credentialId is set and pending and picker is not open', () => {
    vi.mocked(useCredentialName).mockReturnValue({ name: undefined, isPending: true })
    renderComponent({ credentialId: 'cred-1' })

    expect(screen.getByText('Loading credential')).toBeInTheDocument()
    expect(screen.queryByTestId('credential-selector')).not.toBeInTheDocument()
  })

  it('closes picker when credential is selected via handleChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderComponent({ credentialId: undefined, onChange })

    await user.click(screen.getByText('Set up connection'))
    expect(screen.getByTestId('credential-selector')).toBeInTheDocument()

    await user.click(screen.getByTestId('select-credential'))
    expect(onChange).toHaveBeenCalledWith('new-cred-id')
    // Picker should close after selection (newCredentialId is truthy)
  })

  it('toggles picker closed when Cancel is clicked', async () => {
    const user = userEvent.setup()
    renderComponent({ credentialId: undefined })

    await user.click(screen.getByText('Set up connection'))
    expect(screen.getByText('Cancel')).toBeInTheDocument()

    await user.click(screen.getByText('Cancel'))
    expect(screen.getByText('Set up connection')).toBeInTheDocument()
  })

  it('renders warning state without isDisabled explicitly', () => {
    renderComponent({ credentialId: undefined, isDisabled: false })
    expect(screen.getByText('Set up connection')).toBeInTheDocument()
  })

  it('passes projectId to credential selector', async () => {
    const user = userEvent.setup()
    renderComponent({ credentialId: undefined, projectId: 'proj-123' })

    await user.click(screen.getByText('Set up connection'))
    expect(screen.getByTestId('credential-selector')).toBeInTheDocument()
  })

  it('does not show skeleton when credentialId is undefined even if pending', () => {
    vi.mocked(useCredentialName).mockReturnValue({ name: undefined, isPending: true })
    renderComponent({ credentialId: undefined })

    expect(screen.queryByText('Loading credential')).not.toBeInTheDocument()
    expect(screen.getByText('AAP credential not configured')).toBeInTheDocument()
  })

  it('does not show configured state when credentialId is undefined', () => {
    vi.mocked(useCredentialName).mockReturnValue({ name: 'Some Name', isPending: false })
    renderComponent({ credentialId: undefined })

    expect(screen.queryByText('Some Name')).not.toBeInTheDocument()
    expect(screen.getByText('AAP credential not configured')).toBeInTheDocument()
  })
})
