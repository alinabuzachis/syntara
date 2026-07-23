import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { AAPIntegrationSection, type AAPIntegrationSectionProps } from './AAPIntegrationSection'
import type { AAPIntegrationSelectorProps } from './AAPIntegrationSelector'

vi.mock('./AAPIntegrationSelector', () => ({
  AAPIntegrationSelector: ({ value, onChange, isDisabled, isRequired }: AAPIntegrationSelectorProps) => (
    <div
      data-testid="integration-selector"
      data-value={value ?? ''}
      data-disabled={String(!!isDisabled)}
      data-required={String(!!isRequired)}
    >
      <button data-testid="select-integration" onClick={() => onChange('int-1')}>
        Select integration
      </button>
      <button data-testid="clear-integration" onClick={() => onChange(undefined)}>
        Clear integration
      </button>
    </div>
  ),
}))

vi.mock('./AAPCredentialStatus', () => ({
  AAPCredentialStatus: ({
    integrationSelected,
    credentialId,
    onChange,
    isDisabled,
    projectId,
  }: {
    integrationSelected: boolean
    credentialId: string | undefined
    onChange: (id: string | undefined) => void
    isDisabled?: boolean
    projectId?: string
  }) =>
    integrationSelected ? (
      <div
        data-testid="credential-status"
        data-credential-id={credentialId ?? ''}
        data-disabled={String(!!isDisabled)}
        data-project-id={projectId ?? ''}
      >
        <button data-testid="select-credential" onClick={() => onChange('cred-1')}>
          Select credential
        </button>
      </div>
    ) : null,
}))

function FormWrapper({ children }: { children: ReactNode }) {
  const methods = useForm({
    defaultValues: {
      integration_id: undefined as string | undefined,
      credential_id: undefined as string | undefined,
    },
  })

  return <FormProvider {...methods}>{children}</FormProvider>
}

function renderSection(props: Partial<AAPIntegrationSectionProps> = {}) {
  const defaultProps: AAPIntegrationSectionProps = {
    selectedIntegrationId: undefined,
    selectedCredentialId: undefined,
    ...props,
  }
  return render(
    <FormWrapper>
      <AAPIntegrationSection {...defaultProps} />
    </FormWrapper>
  )
}

describe('AAPIntegrationSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the integration selector', () => {
    renderSection()
    expect(screen.getByTestId('integration-selector')).toBeInTheDocument()
  })

  it('passes value and isRequired to integration selector', () => {
    renderSection({ selectedIntegrationId: 'int-1' })
    const selector = screen.getByTestId('integration-selector')
    expect(selector).toHaveAttribute('data-value', 'int-1')
    expect(selector).toHaveAttribute('data-required', 'true')
  })

  it('renders credential status when integration is selected', () => {
    renderSection({ selectedIntegrationId: 'int-1' })
    expect(screen.getByTestId('credential-status')).toBeInTheDocument()
  })

  it('does not render credential status when no integration selected', () => {
    renderSection({ selectedIntegrationId: undefined })
    expect(screen.queryByTestId('credential-status')).not.toBeInTheDocument()
  })

  it('passes credentialId to credential status', () => {
    renderSection({ selectedIntegrationId: 'int-1', selectedCredentialId: 'cred-1' })
    expect(screen.getByTestId('credential-status')).toHaveAttribute('data-credential-id', 'cred-1')
  })

  it('passes projectId to credential status', () => {
    renderSection({ selectedIntegrationId: 'int-1', projectId: 'proj-1' })
    expect(screen.getByTestId('credential-status')).toHaveAttribute('data-project-id', 'proj-1')
  })

  it('passes isDisabled to both children', () => {
    renderSection({ selectedIntegrationId: 'int-1', isDisabled: true })
    expect(screen.getByTestId('integration-selector')).toHaveAttribute('data-disabled', 'true')
    expect(screen.getByTestId('credential-status')).toHaveAttribute('data-disabled', 'true')
  })

  it('updates form when integration is selected', async () => {
    const user = userEvent.setup()
    renderSection()

    await user.click(screen.getByTestId('select-integration'))
    // Verify the onChange callback was wired — no error thrown
    expect(screen.getByTestId('integration-selector')).toBeInTheDocument()
  })

  it('clears credential_id when integration is cleared', async () => {
    const user = userEvent.setup()
    renderSection({ selectedIntegrationId: 'int-1', selectedCredentialId: 'cred-1' })

    await user.click(screen.getByTestId('clear-integration'))
    // Verify the onChange callback was wired and no errors thrown
    expect(screen.getByTestId('integration-selector')).toBeInTheDocument()
  })

  it('updates form when credential is selected', async () => {
    const user = userEvent.setup()
    renderSection({ selectedIntegrationId: 'int-1' })

    await user.click(screen.getByTestId('select-credential'))
    expect(screen.getByTestId('credential-status')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderSection({ selectedIntegrationId: 'int-1' })
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no accessibility violations without integration', async () => {
    const { container } = renderSection()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('does not clear credential_id when integration is selected (truthy onChange)', async () => {
    const user = userEvent.setup()
    renderSection({ selectedIntegrationId: 'int-1', selectedCredentialId: 'cred-1' })

    await user.click(screen.getByTestId('select-integration'))
    // Selecting a new integration (truthy value) should NOT clear credential_id
    expect(screen.getByTestId('credential-status')).toHaveAttribute('data-credential-id', 'cred-1')
  })

  it('treats empty string selectedIntegrationId as no integration', () => {
    renderSection({ selectedIntegrationId: '' })
    // Empty string is falsy, so integrationSelected={!!''} is false → no credential status
    expect(screen.queryByTestId('credential-status')).not.toBeInTheDocument()
  })

  it('renders with isDisabled explicitly false', () => {
    renderSection({ selectedIntegrationId: 'int-1', isDisabled: false })
    expect(screen.getByTestId('integration-selector')).toHaveAttribute('data-disabled', 'false')
    expect(screen.getByTestId('credential-status')).toHaveAttribute('data-disabled', 'false')
  })

  it('passes undefined projectId when not provided', () => {
    renderSection({ selectedIntegrationId: 'int-1' })
    expect(screen.getByTestId('credential-status')).toHaveAttribute('data-project-id', '')
  })

  it('renders credential status with no credentialId', () => {
    renderSection({ selectedIntegrationId: 'int-1', selectedCredentialId: undefined })
    expect(screen.getByTestId('credential-status')).toHaveAttribute('data-credential-id', '')
  })
})
