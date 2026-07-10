import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { CredentialStep } from './CredentialStep'
import type { IntegrationFormData } from './integrationFormSchema'

vi.mock('../../../builder/components/CredentialSelector', () => ({
  CredentialSelector: ({
    label,
    compatibleTypeNames,
    onChange,
  }: {
    label?: string
    compatibleTypeNames?: string[]
    onChange?: (id: string | undefined) => void
  }) => (
    <div data-testid="credential-selector" data-compatible-types={compatibleTypeNames?.join(',')}>
      {label}
      <button data-testid="select-credential" onClick={() => onChange?.('cred-123')}>
        Select
      </button>
    </div>
  ),
}))

function TestWrapper(props: Omit<Parameters<typeof CredentialStep>[0], 'control' | 'setValue'>) {
  const { control, setValue } = useForm<IntegrationFormData>({
    defaultValues: {
      management_credential_id: null,
      integration_type: 'mcp_server',
      configuration: { integration_type: 'mcp_server', base_url: '' },
    },
  })
  return <CredentialStep control={control} setValue={setValue} {...props} />
}

describe('CredentialStep', () => {
  it('renders heading and description', () => {
    render(
      <TestWrapper credentialId={null} isTesting={false} onTestConnection={vi.fn()} onCredentialChange={vi.fn()} />
    )

    expect(screen.getByText('Connection credential')).toBeInTheDocument()
    expect(screen.getByText(/credential is used to discover/i)).toBeInTheDocument()
  })

  it('renders credential selector', () => {
    render(
      <TestWrapper credentialId={null} isTesting={false} onTestConnection={vi.fn()} onCredentialChange={vi.fn()} />
    )

    expect(screen.getByTestId('credential-selector')).toBeInTheDocument()
  })

  it('disables test connection button when no credential selected', () => {
    render(
      <TestWrapper credentialId={null} isTesting={false} onTestConnection={vi.fn()} onCredentialChange={vi.fn()} />
    )

    expect(screen.getByRole('button', { name: 'Test connection' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('enables test connection button when credential is selected', () => {
    render(
      <TestWrapper credentialId="cred-1" isTesting={false} onTestConnection={vi.fn()} onCredentialChange={vi.fn()} />
    )

    expect(screen.getByRole('button', { name: 'Test connection' })).toBeEnabled()
  })

  it('disables button when testing', () => {
    render(
      <TestWrapper credentialId="cred-1" isTesting={true} onTestConnection={vi.fn()} onCredentialChange={vi.fn()} />
    )

    const button = screen.getByRole('button', { name: /test connection/i })
    expect(button).toHaveAttribute('aria-disabled', 'true')
  })

  it('calls onCredentialChange when credential is selected', async () => {
    const user = userEvent.setup()
    const onCredentialChange = vi.fn()

    render(
      <TestWrapper
        credentialId={null}
        isTesting={false}
        onTestConnection={vi.fn()}
        onCredentialChange={onCredentialChange}
      />
    )

    await user.click(screen.getByTestId('select-credential'))

    expect(onCredentialChange).toHaveBeenCalled()
  })

  it('calls onTestConnection when button clicked', async () => {
    const user = userEvent.setup()
    const onTestConnection = vi.fn()

    render(
      <TestWrapper
        credentialId="cred-1"
        isTesting={false}
        onTestConnection={onTestConnection}
        onCredentialChange={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Test connection' }))

    expect(onTestConnection).toHaveBeenCalled()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <TestWrapper credentialId={null} isTesting={false} onTestConnection={vi.fn()} onCredentialChange={vi.fn()} />
    )

    let results: Awaited<ReturnType<typeof axe>>
    await act(async () => {
      results = await axe(container)
    })
    expect(results!).toHaveNoViolations()
  })

  describe('Dynamic credential types', () => {
    function LLMTestWrapper(props: Omit<Parameters<typeof CredentialStep>[0], 'control' | 'setValue'>) {
      const { control, setValue } = useForm<IntegrationFormData>({
        defaultValues: {
          management_credential_id: null,
          integration_type: 'llm_provider',
          configuration: { integration_type: 'llm_provider', provider_hint: 'red_hat_ai', base_url: '' },
        },
      })
      return <CredentialStep control={control} setValue={setValue} {...props} />
    }

    it('passes LLM Provider credential types when integration type is llm_provider', () => {
      render(
        <LLMTestWrapper credentialId={null} isTesting={false} onTestConnection={vi.fn()} onCredentialChange={vi.fn()} />
      )

      expect(screen.getByTestId('credential-selector')).toHaveAttribute('data-compatible-types', 'LLM Provider')
    })

    it('passes HTTP Bearer Token credential types when integration type is mcp_server', () => {
      render(
        <TestWrapper credentialId={null} isTesting={false} onTestConnection={vi.fn()} onCredentialChange={vi.fn()} />
      )

      expect(screen.getByTestId('credential-selector')).toHaveAttribute('data-compatible-types', 'HTTP Bearer Token')
    })
  })
})
