import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { navigate } from 'wouter/use-browser-location'

import { toolProvidersClient } from '../../../../client'

import { IntegrationForm } from './IntegrationForm'

// Mock dependencies
vi.mock('../../../../client', () => ({
  toolProvidersClient: {
    useMutation: vi.fn(),
  },
}))

vi.mock('wouter/use-browser-location', () => ({
  navigate: vi.fn(),
}))

vi.mock('../../../../components/chat/ChatInput', () => ({
  ChatInput: () => <div data-testid="chat-input">Chat Input</div>,
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
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
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
    vi.mocked(toolProvidersClient.useMutation).mockImplementation(((method: string, endpoint: string) => {
      if (endpoint === '/tool-providers') {
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
      } else if (endpoint === '/tool-providers/{provider_id}/validate') {
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
      } else if (endpoint === '/tool-providers/{provider_id}/refresh-tools') {
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
      const { container } = render(<IntegrationForm />, { wrapper })

      // Page header
      expect(screen.getByText('Configure Integration')).toBeInTheDocument()

      // Action buttons
      expect(screen.getByText('Add integration')).toBeInTheDocument()
      expect(screen.getByText('Cancel')).toBeInTheDocument()

      // ChatInput component
      expect(screen.getByTestId('chat-input')).toBeInTheDocument()

      // Grid layout
      const gridContainer = container.querySelector('.grid.grow')
      expect(gridContainer).toBeInTheDocument()
    })
  })

  describe('Form Fields', () => {
    it('renders integration type field with MCP Server option selected by default', () => {
      render(<IntegrationForm />, { wrapper })

      const typeField = screen.getByRole('radiogroup', { name: /integration type/i })
      expect(typeField).toBeInTheDocument()

      const mcpOption = screen.getByRole('radio', { name: /mcp server/i })
      expect(mcpOption).toBeInTheDocument()
      expect(mcpOption).toBeChecked()
    })

    it('renders server name field as required', () => {
      render(<IntegrationForm />, { wrapper })

      const serverNameInput = screen.getByPlaceholderText('Enter server name / ID')
      expect(serverNameInput).toBeInTheDocument()
      expect(serverNameInput).toHaveAttribute('required')
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
      expect(apiUrlInput).toHaveAttribute('required')
    })
  })

  describe('Form Interactions', () => {
    it('allows users to fill out all form fields', () => {
      render(<IntegrationForm />, { wrapper })

      const serverNameInput = screen.getByPlaceholderText('Enter server name / ID') as HTMLInputElement
      const descriptionInput = screen.getByPlaceholderText('Enter description') as HTMLInputElement
      const apiUrlInput = screen.getByPlaceholderText('Enter API URL') as HTMLInputElement

      fireEvent.change(serverNameInput, { target: { value: 'Test Server' } })
      fireEvent.change(descriptionInput, { target: { value: 'Test Description' } })
      fireEvent.change(apiUrlInput, { target: { value: 'https://test.example.com' } })

      expect(serverNameInput.value).toBe('Test Server')
      expect(descriptionInput.value).toBe('Test Description')
      expect(apiUrlInput.value).toBe('https://test.example.com')
    })

    it('submits form data when Add integration button is clicked', async () => {
      render(<IntegrationForm />, { wrapper })

      fireEvent.change(screen.getByPlaceholderText('Enter server name / ID'), {
        target: { value: 'Production Server' },
      })
      fireEvent.change(screen.getByPlaceholderText('Enter description'), {
        target: { value: 'Main production integration' },
      })
      fireEvent.change(screen.getByPlaceholderText('Enter API URL'), {
        target: { value: 'https://prod.example.com/api' },
      })

      const submitButton = screen.getByText('Add integration')
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockCreateMutate).toHaveBeenCalled()
      })
    })

    it('chains validate and refresh-tools calls after successful creation', async () => {
      const mockProviderId = 'test-provider-123'

      // Setup create mutation to call onSuccess callback
      mockCreateMutate.mockImplementation((variables, options) => {
        if (options?.onSuccess) {
          options.onSuccess({ id: mockProviderId })
        }
      })

      // Setup validate mutation to call onSettled callback
      mockValidateMutate.mockImplementation((variables, options) => {
        if (options?.onSettled) {
          options.onSettled()
        }
      })

      // Setup refresh mutation to call onSettled callback
      mockRefreshMutate.mockImplementation((variables, options) => {
        if (options?.onSettled) {
          options.onSettled()
        }
      })

      render(<IntegrationForm />, { wrapper })

      fireEvent.change(screen.getByPlaceholderText('Enter server name / ID'), {
        target: { value: 'Test Server' },
      })
      fireEvent.change(screen.getByPlaceholderText('Enter API URL'), {
        target: { value: 'https://test.example.com' },
      })

      const submitButton = screen.getByText('Add integration')
      fireEvent.click(submitButton)

      await waitFor(() => {
        // Verify create was called
        expect(mockCreateMutate).toHaveBeenCalled()
        // Verify validate was called with the provider ID
        expect(mockValidateMutate).toHaveBeenCalledWith(
          { params: { path: { provider_id: mockProviderId } } },
          expect.objectContaining({ onSettled: expect.any(Function) })
        )
        // Verify refresh-tools was called with the provider ID
        expect(mockRefreshMutate).toHaveBeenCalledWith(
          { params: { path: { provider_id: mockProviderId } } },
          expect.objectContaining({ onSettled: expect.any(Function) })
        )
      })
    })

    it('navigates to integrations list after all API calls complete', async () => {
      const { navigate } = await import('wouter/use-browser-location')
      const mockNav = vi.mocked(navigate)
      const mockProviderId = 'test-provider-456'

      // Setup mutation chain
      mockCreateMutate.mockImplementation((variables, options) => {
        if (options?.onSuccess) {
          options.onSuccess({ id: mockProviderId })
        }
      })

      mockValidateMutate.mockImplementation((variables, options) => {
        if (options?.onSettled) {
          options.onSettled()
        }
      })

      mockRefreshMutate.mockImplementation((variables, options) => {
        if (options?.onSettled) {
          options.onSettled()
        }
      })

      render(<IntegrationForm />, { wrapper })

      fireEvent.change(screen.getByPlaceholderText('Enter server name / ID'), {
        target: { value: 'Test Server' },
      })
      fireEvent.change(screen.getByPlaceholderText('Enter API URL'), {
        target: { value: 'https://test.example.com' },
      })

      const submitButton = screen.getByText('Add integration')
      fireEvent.click(submitButton)

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

      const cancelButton = screen.getByText('Cancel')
      fireEvent.click(cancelButton)

      expect(mockNav).toHaveBeenCalledWith('/configuration/integrations')
    })

    it('has submit button properly linked to form', () => {
      render(<IntegrationForm />, { wrapper })

      const addButton = screen.getByText('Add integration')
      expect(addButton).toHaveAttribute('form', 'integration-form')
      expect(addButton).toHaveAttribute('type', 'submit')
    })
  })
})
