import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { navigate } from 'wouter/use-browser-location'

import { toolManagerClient } from '../../../../client'
import { AlertProvider } from '../../../../providers/alerts'

import { IntegrationForm } from './IntegrationForm'

// Mock dependencies
vi.mock('../../../../client', () => ({
  toolManagerClient: {
    useMutation: vi.fn(),
  },
}))

vi.mock('wouter/use-browser-location', () => ({
  navigate: vi.fn(),
}))

// Create a QueryClient instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

describe('IntegrationForm Component', () => {
  const mockCreateMutate = vi.fn()
  const mockValidateMutate = vi.fn()
  const mockRefreshMutate = vi.fn()
  const mockNavigate = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    // Get the mocked navigate function
    mockNavigate.mockImplementation(navigate)

    // Mock the mutation hooks - return different mutate functions for each endpoint
    vi.mocked(toolManagerClient.useMutation).mockImplementation(((_method: string, endpoint: string) => {
      if (endpoint === '/tool_manager/tool_providers') {
        return {
          mutate: mockCreateMutate,
          isPending: false,
          isError: false,
          error: null,
          data: null,
          reset: vi.fn(),
          mutateAsync: vi.fn(),
          isIdle: true,
          isSuccess: false,
          failureCount: 0,
          failureReason: null,
          context: undefined,
          submittedAt: 0,
          variables: undefined,
          status: 'idle',
          isPaused: false,
        }
      } else if (endpoint === '/tool_manager/tool_providers/{provider_id}/validate') {
        return {
          mutate: mockValidateMutate,
          isPending: false,
          isError: false,
          error: null,
          data: null,
          reset: vi.fn(),
          mutateAsync: vi.fn(),
          isIdle: true,
          isSuccess: false,
          failureCount: 0,
          failureReason: null,
          context: undefined,
          submittedAt: 0,
          variables: undefined,
          status: 'idle',
          isPaused: false,
        }
      } else if (endpoint === '/tool_manager/tool_providers/{provider_id}/refresh_tools') {
        return {
          mutate: mockRefreshMutate,
          isPending: false,
          isError: false,
          error: null,
          data: null,
          reset: vi.fn(),
          mutateAsync: vi.fn(),
          isIdle: true,
          isSuccess: false,
          failureCount: 0,
          failureReason: null,
          context: undefined,
          submittedAt: 0,
          variables: undefined,
          status: 'idle',
          isPaused: false,
        }
      }
    }) as never)
  })

  describe('Rendering', () => {
    it('renders the component with all required elements', () => {
      render(<IntegrationForm />, { wrapper })

      // Page header
      expect(screen.getByRole('heading', { name: 'Configure integration' })).toBeInTheDocument()

      // Action buttons
      expect(screen.getByRole('button', { name: 'Configure integration' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()

      expect(screen.getByRole('form', { name: 'Configure integration' })).toBeInTheDocument()
    })
  })

  describe('Form Fields', () => {
    it('renders integration type field with MCP Server option selected by default', () => {
      render(<IntegrationForm />, { wrapper })

      // PF ToggleGroup uses role="group" with aria-label
      const typeField = screen.getByRole('group', { name: /integration type selection/i })
      expect(typeField).toBeInTheDocument()

      // PF ToggleGroupItem uses aria-pressed="true" when selected
      const mcpOption = screen.getByRole('button', { name: /mcp server/i })
      expect(mcpOption).toBeInTheDocument()
      expect(mcpOption).toHaveAttribute('aria-pressed', 'true')
    })

    it('renders server name field as required', () => {
      render(<IntegrationForm />, { wrapper })

      const serverNameInput = screen.getByPlaceholderText('Enter server name / ID')
      expect(serverNameInput).toBeInTheDocument()
      expect(serverNameInput).toHaveAttribute('aria-required', 'true')
    })

    it('renders description field', () => {
      render(<IntegrationForm />, { wrapper })

      const descriptionInput = screen.getByPlaceholderText('Enter description')
      expect(descriptionInput).toBeInTheDocument()
    })

    it('renders API URL field as required', () => {
      render(<IntegrationForm />, { wrapper })

      const apiUrlInput = screen.getByPlaceholderText('Enter API URL')
      expect(apiUrlInput).toBeInTheDocument()
      expect(apiUrlInput).toHaveAttribute('aria-required', 'true')
    })
  })

  describe('Form Interactions', () => {
    it('does not submit when required fields are empty', async () => {
      const user = userEvent.setup()
      render(<IntegrationForm />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'Configure integration' }))
      await waitFor(() => {
        expect(mockCreateMutate).not.toHaveBeenCalled()
      })
    })

    it('does not submit when API URL is invalid', async () => {
      const user = userEvent.setup()
      render(<IntegrationForm />, { wrapper })

      await user.type(screen.getByPlaceholderText('Enter server name / ID'), 'My Server')
      await user.type(screen.getByPlaceholderText('Enter API URL'), 'not-a-url')
      await user.click(screen.getByRole('button', { name: 'Configure integration' }))
      await waitFor(() => {
        expect(mockCreateMutate).not.toHaveBeenCalled()
      })
    })

    it('allows users to fill out all form fields', async () => {
      const user = userEvent.setup()
      render(<IntegrationForm />, { wrapper })

      const serverNameInput = screen.getByPlaceholderText('Enter server name / ID')
      const descriptionInput = screen.getByPlaceholderText('Enter description')
      const apiUrlInput = screen.getByPlaceholderText('Enter API URL')

      await user.type(serverNameInput, 'Test Server')
      await user.type(descriptionInput, 'Test Description')
      await user.type(apiUrlInput, 'https://test.example.com')

      expect((serverNameInput as HTMLInputElement).value).toBe('Test Server')
      expect((descriptionInput as HTMLInputElement).value).toBe('Test Description')
      expect((apiUrlInput as HTMLInputElement).value).toBe('https://test.example.com')
    })

    it('submits form data when Configure integration button is clicked', async () => {
      const user = userEvent.setup()
      render(<IntegrationForm />, { wrapper })

      await user.type(screen.getByPlaceholderText('Enter server name / ID'), 'Production Server')
      await user.type(screen.getByPlaceholderText('Enter description'), 'Main production integration')
      await user.type(screen.getByPlaceholderText('Enter API URL'), 'https://prod.example.com/api')

      const submitButton = screen.getByRole('button', { name: 'Configure integration' })
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockCreateMutate).toHaveBeenCalled()
      })
    })

    it('chains validate and refresh-tools calls after successful creation', async () => {
      const mockProviderId = 'test-provider-123'

      // Setup create mutation to call onSuccess callback
      mockCreateMutate.mockImplementation(
        (
          _variables: unknown,
          options?: {
            onSuccess?: (...args: unknown[]) => void
            onError?: (...args: unknown[]) => void
            onSettled?: () => void
          }
        ) => {
          if (options?.onSuccess) {
            options.onSuccess({ id: mockProviderId })
          }
        }
      )

      // Setup validate mutation to call onSuccess with valid: true
      mockValidateMutate.mockImplementation(
        (
          _variables: unknown,
          options?: {
            onSuccess?: (...args: unknown[]) => void
            onError?: (...args: unknown[]) => void
            onSettled?: () => void
          }
        ) => {
          if (options?.onSuccess) {
            options.onSuccess({ valid: true, provider_type: 'mcp', validated_at: new Date().toISOString() })
          }
        }
      )

      // Setup refresh mutation to call onSettled callback
      mockRefreshMutate.mockImplementation(
        (
          _variables: unknown,
          options?: {
            onSuccess?: (...args: unknown[]) => void
            onError?: (...args: unknown[]) => void
            onSettled?: () => void
          }
        ) => {
          if (options?.onSettled) {
            options.onSettled()
          }
        }
      )

      const user = userEvent.setup()
      render(<IntegrationForm />, { wrapper })

      await user.type(screen.getByPlaceholderText('Enter server name / ID'), 'Test Server')
      await user.type(screen.getByPlaceholderText('Enter API URL'), 'https://test.example.com')

      const submitButton = screen.getByRole('button', { name: 'Configure integration' })
      await user.click(submitButton)

      await waitFor(() => {
        // Verify create was called
        expect(mockCreateMutate).toHaveBeenCalled()
        // Verify validate was called with the provider ID
        expect(mockValidateMutate).toHaveBeenCalledWith(
          { params: { path: { provider_id: mockProviderId } } },
          expect.objectContaining({ onSuccess: expect.any(Function) as unknown })
        )
        // Verify refresh-tools was called with the provider ID
        expect(mockRefreshMutate).toHaveBeenCalledWith(
          { params: { path: { provider_id: mockProviderId } } },
          expect.objectContaining({ onSettled: expect.any(Function) as unknown })
        )
      })
    })

    it('shows error and does not refresh tools when validation returns valid: false', async () => {
      const { navigate } = await import('wouter/use-browser-location')
      const mockNav = vi.mocked(navigate)
      const mockProviderId = 'test-provider-invalid'

      // Setup create mutation to call onSuccess callback
      mockCreateMutate.mockImplementation(
        (
          _variables: unknown,
          options?: {
            onSuccess?: (...args: unknown[]) => void
            onError?: (...args: unknown[]) => void
            onSettled?: () => void
          }
        ) => {
          if (options?.onSuccess) {
            options.onSuccess({ id: mockProviderId })
          }
        }
      )

      // Setup validate mutation to return valid: false
      mockValidateMutate.mockImplementation(
        (
          _variables: unknown,
          options?: {
            onSuccess?: (...args: unknown[]) => void
            onError?: (...args: unknown[]) => void
            onSettled?: () => void
          }
        ) => {
          if (options?.onSuccess) {
            options.onSuccess({
              valid: false,
              provider_type: 'mcp',
              validated_at: new Date().toISOString(),
              error: 'Connection refused: unable to reach MCP server at https://bad-url.example.com',
            })
          }
        }
      )

      const user = userEvent.setup()
      render(<IntegrationForm />, { wrapper })

      await user.type(screen.getByPlaceholderText('Enter server name / ID'), 'Bad Server')
      await user.type(screen.getByPlaceholderText('Enter API URL'), 'https://bad-url.example.com')

      const submitButton = screen.getByRole('button', { name: 'Configure integration' })
      await user.click(submitButton)

      await waitFor(() => {
        // Verify create and validate were called
        expect(mockCreateMutate).toHaveBeenCalled()
        expect(mockValidateMutate).toHaveBeenCalled()
        // Refresh tools should NOT be called when validation fails
        expect(mockRefreshMutate).not.toHaveBeenCalled()
        // Should navigate to integrations list
        expect(mockNav).toHaveBeenCalledWith('/configuration/integrations')
      })

      // Error alert should be visible
      await waitFor(() => {
        expect(screen.getByText('Integration created, but validation failed')).toBeInTheDocument()
        expect(screen.getByText(/Connection refused/)).toBeInTheDocument()
      })
    })

    it('navigates to integrations list after all API calls complete', async () => {
      const { navigate } = await import('wouter/use-browser-location')
      const mockNav = vi.mocked(navigate)
      const mockProviderId = 'test-provider-456'

      // Setup mutation chain
      mockCreateMutate.mockImplementation(
        (
          _variables: unknown,
          options?: {
            onSuccess?: (...args: unknown[]) => void
            onError?: (...args: unknown[]) => void
            onSettled?: () => void
          }
        ) => {
          if (options?.onSuccess) {
            options.onSuccess({ id: mockProviderId })
          }
        }
      )

      mockValidateMutate.mockImplementation(
        (
          _variables: unknown,
          options?: {
            onSuccess?: (...args: unknown[]) => void
            onError?: (...args: unknown[]) => void
            onSettled?: () => void
          }
        ) => {
          if (options?.onSuccess) {
            options.onSuccess({ valid: true, provider_type: 'mcp', validated_at: new Date().toISOString() })
          }
        }
      )

      mockRefreshMutate.mockImplementation(
        (
          _variables: unknown,
          options?: {
            onSuccess?: (...args: unknown[]) => void
            onError?: (...args: unknown[]) => void
            onSettled?: () => void
          }
        ) => {
          if (options?.onSettled) {
            options.onSettled()
          }
        }
      )

      const user = userEvent.setup()
      render(<IntegrationForm />, { wrapper })

      await user.type(screen.getByPlaceholderText('Enter server name / ID'), 'Test Server')
      await user.type(screen.getByPlaceholderText('Enter API URL'), 'https://test.example.com')

      const submitButton = screen.getByRole('button', { name: 'Configure integration' })
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockNav).toHaveBeenCalledWith('/configuration/integrations')
      })
    })
  })

  describe('Navigation', () => {
    it('navigates back to integrations list when Cancel is clicked', async () => {
      const { navigate } = await import('wouter/use-browser-location')
      const mockNav = vi.mocked(navigate)

      render(<IntegrationForm />, { wrapper })

      const user = userEvent.setup()
      const cancelButton = screen.getByText('Cancel')
      await user.click(cancelButton)

      expect(mockNav).toHaveBeenCalledWith('/configuration/integrations')
    })

    it('has submit button properly linked to form', () => {
      render(<IntegrationForm />, { wrapper })

      // Use getByRole to find the actual button element (not the inner span)
      const addButton = screen.getByRole('button', { name: /configure integration/i })
      expect(addButton).toHaveAttribute('form', 'integration-form')
      expect(addButton).toHaveAttribute('type', 'submit')
    })
  })
})
