import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { integrationsClient } from '../../../../client'
import { navigate } from '../../../../hooks/routing/navigate'
import { AlertProvider } from '../../../../providers/alerts'

import { IntegrationForm } from './IntegrationForm'

vi.mock('../../../../client', () => ({
  integrationsClient: {
    useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isError: false })),
  },
  credentialsClient: {
    useQuery: vi.fn(() => ({ data: { results: [] }, isLoading: false, error: null, refetch: vi.fn() })),
  },
}))

vi.mock('../../../../hooks/routing/navigate', () => ({
  navigate: vi.fn(),
}))

vi.mock('../../../access/useAllProjects', () => ({
  useAllProjects: vi.fn(() => ({ projects: [], isLoading: false, error: null, refetch: vi.fn() })),
}))

vi.mock('../../../builder/components/CredentialSelector', () => ({
  CredentialSelector: ({
    label,
    fieldId,
    onChange,
  }: {
    label?: string
    fieldId?: string
    onChange?: (id: string | undefined) => void
  }) => (
    <div data-testid="credential-selector" aria-label={label}>
      <input id={fieldId} aria-label={label} />
      <button data-testid="select-credential" onClick={() => onChange?.('cred-123')}>
        Select credential
      </button>
      <button data-testid="clear-credential" onClick={() => onChange?.(undefined)}>
        Clear credential
      </button>
    </div>
  ),
}))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

function advanceToStep2(user: ReturnType<typeof userEvent.setup>) {
  return async () => {
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Test MCP')
    await user.type(screen.getByRole('textbox', { name: /base url/i }), 'http://localhost:8765/mcp')
    await user.click(screen.getByRole('button', { name: 'Next' }))
  }
}

type MutationCallbacks = {
  onSuccess?: (result: unknown) => void
  onError?: (error: unknown) => void
}

function mockMutations(discoverMutate?: Mock, createMutate?: Mock) {
  const discoverFn = discoverMutate ?? vi.fn()
  const createFn = createMutate ?? vi.fn()
  vi.mocked(integrationsClient.useMutation).mockImplementation((_method: string, path: string) => {
    if (path === '/integrations/discover') {
      return { mutate: discoverFn, isPending: false, isError: false } as never
    }
    return { mutate: createFn, isPending: false, isError: false } as never
  })
  return { discoverMutate: discoverFn, createMutate: createFn }
}

describe('IntegrationForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the wizard with three steps in navigation', () => {
    render(<IntegrationForm />, { wrapper })

    const nav = screen.getByRole('navigation', { name: /wizard/i })
    expect(nav).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Integration details/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Connection credential/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Enable tools/i })).toBeInTheDocument()
  })

  it('shows step 1 fields by default', () => {
    render(<IntegrationForm />, { wrapper })

    expect(screen.getByText('MCP Server')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /name/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /description/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /base url/i })).toBeInTheDocument()
  })

  it('shows MCP Server as selected integration type', () => {
    render(<IntegrationForm />, { wrapper })

    expect(screen.getByText('MCP Server')).toBeInTheDocument()
  })

  it('shows Next and Cancel buttons on step 1', () => {
    render(<IntegrationForm />, { wrapper })

    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
  })

  it('validates required fields before advancing to step 2', async () => {
    const user = userEvent.setup()
    render(<IntegrationForm />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByText('Server name / ID is required')).toBeInTheDocument()
    expect(screen.getByText('Base URL is required')).toBeInTheDocument()
  })

  it('advances to step 2 when required fields are filled', async () => {
    const user = userEvent.setup()
    render(<IntegrationForm />, { wrapper })

    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Test MCP')
    await user.type(screen.getByRole('textbox', { name: /base url/i }), 'http://localhost:8765/mcp')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByText(/This credential is used to discover/)).toBeInTheDocument()
    expect(screen.getByTestId('credential-selector')).toBeInTheDocument()
  })

  it('shows Back button on step 2', async () => {
    const user = userEvent.setup()
    render(<IntegrationForm />, { wrapper })

    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Test MCP')
    await user.type(screen.getByRole('textbox', { name: /base url/i }), 'http://localhost:8765/mcp')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
  })

  it('renders the page header with breadcrumbs', () => {
    render(<IntegrationForm />, { wrapper })

    expect(screen.getByRole('heading', { name: 'Configure integration' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument()
  })

  it('allows users to fill out all form fields', async () => {
    const user = userEvent.setup()
    render(<IntegrationForm />, { wrapper })

    const nameInput = screen.getByRole('textbox', { name: /name/i })
    const descriptionInput = screen.getByRole('textbox', { name: /description/i })
    const baseUrlInput = screen.getByRole('textbox', { name: /base url/i })

    await user.type(nameInput, 'My MCP Server')
    await user.type(descriptionInput, 'A test integration')
    await user.type(baseUrlInput, 'http://localhost:8765/mcp')

    expect(nameInput).toHaveValue('My MCP Server')
    expect(descriptionInput).toHaveValue('A test integration')
    expect(baseUrlInput).toHaveValue('http://localhost:8765/mcp')
  })

  it('does not advance when API URL is invalid', async () => {
    const user = userEvent.setup()
    render(<IntegrationForm />, { wrapper })

    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Test MCP')
    await user.type(screen.getByRole('textbox', { name: /base url/i }), 'not-a-url')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByText(/must be a valid url/i)).toBeInTheDocument()
    expect(screen.queryByText(/This credential is used to discover/)).not.toBeInTheDocument()
  })

  it('navigates to integrations list when Cancel is clicked', async () => {
    const user = userEvent.setup()
    render(<IntegrationForm />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(navigate).toHaveBeenCalledWith('/configuration/integrations')
  })

  it('navigates back to step 1 when Back is clicked on step 2', async () => {
    const user = userEvent.setup()
    render(<IntegrationForm />, { wrapper })

    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Test MCP')
    await user.type(screen.getByRole('textbox', { name: /base url/i }), 'http://localhost:8765/mcp')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByText(/This credential is used to discover/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(screen.getByRole('textbox', { name: /name/i })).toBeInTheDocument()
  })

  it('shows Save button on the final step', async () => {
    const user = userEvent.setup()
    render(<IntegrationForm />, { wrapper })

    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Test MCP')
    await user.type(screen.getByRole('textbox', { name: /base url/i }), 'http://localhost:8765/mcp')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByTestId('select-credential'))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
  })

  it('calls createIntegration on Save with form data', async () => {
    const mockMutate = vi.fn()
    vi.mocked(integrationsClient.useMutation).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      isError: false,
    } as never)

    const user = userEvent.setup()
    render(<IntegrationForm />, { wrapper })

    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Test MCP')
    await user.type(screen.getByRole('textbox', { name: /base url/i }), 'http://localhost:8765/mcp')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByTestId('select-credential'))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalled()
    })
  })

  describe('Step 2 credential requirement', () => {
    it('disables Next button on step 2 when no credential is selected', async () => {
      const user = userEvent.setup()
      render(<IntegrationForm />, { wrapper })

      await advanceToStep2(user)()

      expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('aria-disabled', 'true')
    })

    it('enables Next button on step 2 after selecting a credential', async () => {
      const user = userEvent.setup()
      render(<IntegrationForm />, { wrapper })

      await advanceToStep2(user)()
      await user.click(screen.getByTestId('select-credential'))

      expect(screen.getByRole('button', { name: 'Next' })).not.toHaveAttribute('aria-disabled', 'true')
    })

    it('can navigate backwards from step 2 to step 1 without credential', async () => {
      const user = userEvent.setup()
      render(<IntegrationForm />, { wrapper })

      await advanceToStep2(user)()
      await user.click(screen.getByRole('button', { name: 'Back' }))

      expect(screen.getByRole('textbox', { name: /name/i })).toBeInTheDocument()
    })

    it('can navigate backwards from step 3 to step 2', async () => {
      const user = userEvent.setup()
      render(<IntegrationForm />, { wrapper })

      await advanceToStep2(user)()
      await user.click(screen.getByTestId('select-credential'))
      await user.click(screen.getByRole('button', { name: 'Next' }))
      await user.click(screen.getByRole('button', { name: 'Back' }))

      expect(screen.getByText(/credential is used to discover/i)).toBeInTheDocument()
    })
  })

  describe('Test connection (discover)', () => {
    it('calls discover endpoint when Test connection is clicked with a credential', async () => {
      const { discoverMutate } = mockMutations()
      const user = userEvent.setup()
      render(<IntegrationForm />, { wrapper })

      await advanceToStep2(user)()
      await user.click(screen.getByTestId('select-credential'))
      await user.click(screen.getByRole('button', { name: 'Test connection' }))

      expect(discoverMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          body: expect.objectContaining({
            integration_type: 'mcp_server',
            credential_id: 'cred-123',
          }),
        }),
        expect.any(Object)
      )
    })

    it('shows success alert when discover returns tools', async () => {
      const discoverMutate = vi.fn()
      discoverMutate.mockImplementation((_body: unknown, callbacks: MutationCallbacks) => {
        callbacks.onSuccess?.({
          success: true,
          discovered_tools: [
            { name: 'tool1', description: 'Tool 1' },
            { name: 'tool2', description: 'Tool 2' },
          ],
        })
      })
      mockMutations(discoverMutate)

      const user = userEvent.setup()
      render(<IntegrationForm />, { wrapper })

      await advanceToStep2(user)()
      await user.click(screen.getByTestId('select-credential'))
      await user.click(screen.getByRole('button', { name: 'Test connection' }))

      await waitFor(() => {
        expect(screen.getByText('Connection tested')).toBeInTheDocument()
        expect(screen.getByText('Successfully connected. Discovered 2 tool(s).')).toBeInTheDocument()
      })
    })

    it('shows failure alert when discover returns success: false', async () => {
      const discoverMutate = vi.fn()
      discoverMutate.mockImplementation((_body: unknown, callbacks: MutationCallbacks) => {
        callbacks.onSuccess?.({
          success: false,
          error: 'Connection refused: unable to reach MCP server',
        })
      })
      mockMutations(discoverMutate)

      const user = userEvent.setup()
      render(<IntegrationForm />, { wrapper })

      await advanceToStep2(user)()
      await user.click(screen.getByTestId('select-credential'))
      await user.click(screen.getByRole('button', { name: 'Test connection' }))

      await waitFor(() => {
        expect(screen.getByText('Connection failed')).toBeInTheDocument()
        expect(screen.getByText('Connection refused: unable to reach MCP server')).toBeInTheDocument()
      })
    })

    it('shows error alert when discover request fails', async () => {
      const discoverMutate = vi.fn()
      discoverMutate.mockImplementation((_body: unknown, callbacks: MutationCallbacks) => {
        callbacks.onError?.(new Error('Network error'))
      })
      mockMutations(discoverMutate)

      const user = userEvent.setup()
      render(<IntegrationForm />, { wrapper })

      await advanceToStep2(user)()
      await user.click(screen.getByTestId('select-credential'))
      await user.click(screen.getByRole('button', { name: 'Test connection' }))

      await waitFor(() => {
        expect(screen.getByText('Connection test failed')).toBeInTheDocument()
      })
    })

    it('discovered tools appear on step 3 after successful test', async () => {
      const discoverMutate = vi.fn()
      discoverMutate.mockImplementation((_body: unknown, callbacks: MutationCallbacks) => {
        callbacks.onSuccess?.({
          success: true,
          discovered_tools: [
            { name: 'get_repo', description: 'Get repository details' },
            { name: 'create_pr', description: 'Create a pull request' },
          ],
        })
      })
      mockMutations(discoverMutate)

      const user = userEvent.setup()
      render(<IntegrationForm />, { wrapper })

      await advanceToStep2(user)()
      await user.click(screen.getByTestId('select-credential'))
      await user.click(screen.getByRole('button', { name: 'Test connection' }))

      await waitFor(() => {
        expect(screen.getByText('Connection tested')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: 'Next' }))

      expect(screen.getByText('get_repo')).toBeInTheDocument()
      expect(screen.getByText('create_pr')).toBeInTheDocument()
    })

    it('does not call discover when no credential is selected', async () => {
      const { discoverMutate } = mockMutations()
      const user = userEvent.setup()
      render(<IntegrationForm />, { wrapper })

      await advanceToStep2(user)()

      expect(screen.getByRole('button', { name: 'Test connection' })).toHaveAttribute('aria-disabled', 'true')
      expect(discoverMutate).not.toHaveBeenCalled()
    })
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<IntegrationForm />, { wrapper })
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
