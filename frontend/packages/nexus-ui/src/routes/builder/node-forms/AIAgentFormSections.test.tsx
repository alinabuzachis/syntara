import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { AIAgentFormData } from './aiAgentFormSchema'
import { LLMSection, NO_PROJECT_MESSAGE, ToolsLoadError } from './AIAgentFormSections'

vi.mock('../components/LLMModelSelector', () => ({
  LLMModelSelector: ({
    onChange,
    value,
  }: {
    onChange: (selection: { llm_model_id: string } | undefined) => void
    value?: { llm_model_id: string }
  }) => (
    <div>
      <span data-testid="selected-model">{value?.llm_model_id ?? 'none'}</span>
      <button type="button" onClick={() => onChange({ llm_model_id: 'model-2' })}>
        Select model
      </button>
      <button type="button" onClick={() => onChange(undefined)}>
        Clear model
      </button>
    </div>
  ),
}))

vi.mock('../components/LLMCredentialStatus', () => ({
  LLMCredentialStatus: ({
    credentialId,
    onChange,
  }: {
    credentialId?: string
    onChange: (id: string | undefined) => void
  }) => (
    <div>
      <span data-testid="selected-credential">{credentialId ?? 'none'}</span>
      <button type="button" onClick={() => onChange('cred-1')}>
        Select credential
      </button>
    </div>
  ),
}))

vi.mock('../../../components/FieldHelpPopover', () => ({
  FieldHelpPopover: ({ headerContent }: { headerContent?: string }) => <span>{headerContent}</span>,
}))

function FormValuesProbe() {
  const [modelId, credentialId] = useWatch<AIAgentFormData, ['llm_model_id', 'credential_id']>({
    name: ['llm_model_id', 'credential_id'],
  })
  return (
    <>
      <output data-testid="model-value">{modelId}</output>
      <output data-testid="credential-value">{credentialId ?? ''}</output>
    </>
  )
}

function FormWrapper({
  children,
  defaultValues,
}: Readonly<{ children: ReactNode; defaultValues?: Partial<AIAgentFormData> }>) {
  const methods = useForm<AIAgentFormData>({
    defaultValues: {
      name: '',
      llm_model_id: '',
      prompt: '',
      tool_selection_strategy: 'NONE',
      tool_selections: [],
      integration_connections: [],
      credential_id: undefined,
      settings: {},
      ...defaultValues,
    },
  })
  return (
    <FormProvider {...methods}>
      {children}
      <FormValuesProbe />
    </FormProvider>
  )
}

describe('AIAgentFormSections', () => {
  it('exports the no-project message', () => {
    expect(NO_PROJECT_MESSAGE).toMatch(/Select a project/)
  })

  it('renders tools load error with retry', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(<ToolsLoadError onRetry={onRetry} />)

    expect(screen.getByText(/Failed to load tools or integrations/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('updates llm_model_id when a model is selected', async () => {
    const user = userEvent.setup()
    render(
      <FormWrapper>
        <LLMSection isVersionView={false} projectId="proj-1" />
      </FormWrapper>
    )

    await user.click(screen.getByRole('button', { name: 'Select model' }))
    expect(screen.getByTestId('model-value')).toHaveTextContent('model-2')
  })

  it('clears credential_id when model selection is cleared', async () => {
    const user = userEvent.setup()
    render(
      <FormWrapper defaultValues={{ llm_model_id: 'model-1', credential_id: 'cred-1' }}>
        <LLMSection isVersionView={false} projectId="proj-1" />
      </FormWrapper>
    )

    expect(screen.getByTestId('model-value')).toHaveTextContent('model-1')
    expect(screen.getByTestId('credential-value')).toHaveTextContent('cred-1')

    await user.click(screen.getByRole('button', { name: 'Clear model' }))

    expect(screen.getByTestId('model-value')).toHaveTextContent('')
    expect(screen.getByTestId('credential-value')).toHaveTextContent('')
  })

  it('has no accessibility violations for ToolsLoadError', async () => {
    const { container } = render(<ToolsLoadError onRetry={() => {}} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
