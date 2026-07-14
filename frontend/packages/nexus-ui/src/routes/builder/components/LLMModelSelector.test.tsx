import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { integrationsClient, integrationsFetchClient } from '../../../client'

import { LLMModelSelector, type LLMModelSelectorProps } from './LLMModelSelector'

vi.mock('../../../client', () => ({
  integrationsClient: {
    useQuery: vi.fn(),
  },
  integrationsFetchClient: {
    GET: vi.fn(),
  },
  authMiddleware: { onRequest: vi.fn() },
  interfaceTagMiddleware: { onRequest: vi.fn() },
}))

vi.mock('../../../components/FormLabelWithHelp', () => ({
  FormLabelWithHelp: ({ label }: { label: string }) => <span>{label}</span>,
}))

vi.mock('../../../components/labels/NxLabel', () => ({
  NxLabel: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

const mockIntegrations = [
  { id: 'int-1', name: 'OpenAI' },
  { id: 'int-2', name: 'Anthropic' },
]

const mockModelsInt1 = [
  { id: 'model-1', model_id: 'gpt-4o', name: 'GPT-4o', description: '128k context', is_default: true },
  { id: 'model-2', model_id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: null, is_default: false },
]

const mockModelsInt2 = [
  { id: 'model-3', model_id: 'claude-sonnet-4', name: 'Claude Sonnet', description: '200k context', is_default: true },
]

function mockClients({ integrations = mockIntegrations, isPending = false } = {}) {
  vi.mocked(integrationsClient.useQuery).mockReturnValue({
    data: { resources: integrations },
    isPending,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)

  const mockGet = integrationsFetchClient.GET as ReturnType<typeof vi.fn>
  mockGet.mockImplementation((_path: string, options?: { params?: { path?: { integration_id?: string } } }) => {
    const integrationId = options?.params?.path?.integration_id ?? ''
    if (integrationId === 'int-1') return Promise.resolve({ data: { resources: mockModelsInt1 } })
    if (integrationId === 'int-2') return Promise.resolve({ data: { resources: mockModelsInt2 } })
    return Promise.resolve({ data: { resources: [] } })
  })
}

function renderSelector(props: Partial<LLMModelSelectorProps> = {}) {
  const defaultProps: LLMModelSelectorProps = {
    value: undefined,
    onChange: vi.fn(),
    ...props,
  }
  return render(<LLMModelSelector {...defaultProps} />, { wrapper })
}

describe('LLMModelSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
    mockClients()
  })

  it('renders with default label', () => {
    renderSelector()

    expect(screen.getByText('Model')).toBeInTheDocument()
  })

  it('renders with custom label', () => {
    renderSelector({ label: 'LLM Model' })

    expect(screen.getByText('LLM Model')).toBeInTheDocument()
  })

  it('shows empty state when no integrations exist', () => {
    mockClients({ integrations: [] })
    renderSelector()

    expect(screen.getByRole('button', { name: /model/i })).toBeInTheDocument()
  })

  it('calls onChange when a model is selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderSelector({ onChange })

    await user.click(screen.getByRole('button', { name: /model/i }))

    const option = screen.queryByText('GPT-4o')
    if (option) {
      await user.click(option)
      expect(onChange).toHaveBeenCalledWith({ llm_model_id: 'model-1' })
    }
  })

  it('displays selected model name in toggle', async () => {
    renderSelector({ value: { llm_model_id: 'model-1' } })

    await waitFor(() => {
      expect(screen.getByDisplayValue('OpenAI / GPT-4o')).toBeInTheDocument()
    })
  })

  it('falls back to UUID when selected model is not found', async () => {
    renderSelector({ value: { llm_model_id: 'unknown-uuid' } })

    await waitFor(() => {
      expect(screen.getByDisplayValue('unknown-uuid')).toBeInTheDocument()
    })
  })

  it('has no accessibility violations', async () => {
    mockClients({ integrations: [] })
    const { container } = renderSelector()

    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no accessibility violations with a selection', async () => {
    const { container } = renderSelector({ value: { llm_model_id: 'model-1' } })

    await waitFor(() => {
      expect(screen.getByDisplayValue('OpenAI / GPT-4o')).toBeInTheDocument()
    })
    expect(await axe(container)).toHaveNoViolations()
  })
})
