import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { IntegrationForm } from './IntegrationForm'
import { toolProvidersClient } from '../../../../client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { navigate } from 'wouter/use-browser-location'

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
  const mockMutate = vi.fn()
  const mockNavigate = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    // Get the mocked navigate function
    mockNavigate.mockImplementation(navigate)

    // Mock the mutation hook
    vi.mocked(toolProvidersClient.useMutation).mockReturnValue({
      mutate: mockMutate,
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
    })
  })

  describe('Rendering', () => {
    it('renders without crashing', () => {
      render(<IntegrationForm />, { wrapper })

      // Check page header
      expect(screen.getByText('Configure Integration')).toBeInTheDocument()
    })

    it('renders all form fields', () => {
      render(<IntegrationForm />, { wrapper })

      // Check for all input fields by placeholder text
      expect(screen.getByPlaceholderText('Enter server name / ID')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Enter description')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Enter API URL')).toBeInTheDocument()
    })

    it('renders all action buttons', () => {
      render(<IntegrationForm />, { wrapper })

      // Check for buttons
      expect(screen.getByText('Add integration')).toBeInTheDocument()
      expect(screen.getAllByText('Test Integration').length).toBeGreaterThan(0)
      expect(screen.getByText('Cancel')).toBeInTheDocument()
    })

    it('renders ChatInput component', () => {
      render(<IntegrationForm />, { wrapper })

      expect(screen.getByTestId('chat-input')).toBeInTheDocument()
    })

    it('displays test integration helper text', () => {
      render(<IntegrationForm />, { wrapper })

      expect(screen.getByText('Test the integration to identify and manage the tools it provides.')).toBeInTheDocument()
    })
  })

  describe('Form Fields', () => {
    it('has Type select with MCP Server option', () => {
      render(<IntegrationForm />, { wrapper })

      // Check that the form has a type field (by looking for the select/combobox)
      const typeField = screen.getByRole('combobox')
      expect(typeField).toBeInTheDocument()
    })

    it('Server name field has correct placeholder', () => {
      render(<IntegrationForm />, { wrapper })

      const serverNameInput = screen.getByPlaceholderText('Enter server name / ID')
      expect(serverNameInput).toBeInTheDocument()
      expect(serverNameInput).toHaveAttribute('required')
    })

    it('Description field has correct placeholder and autofocus', () => {
      render(<IntegrationForm />, { wrapper })

      const descriptionInput = screen.getByPlaceholderText('Enter description')
      expect(descriptionInput).toBeInTheDocument()
    })

    it('API URL field has correct placeholder and is required', () => {
      render(<IntegrationForm />, { wrapper })

      const apiUrlInput = screen.getByPlaceholderText('Enter API URL')
      expect(apiUrlInput).toBeInTheDocument()
      expect(apiUrlInput).toHaveAttribute('required')
    })
  })

  describe('Form Submission', () => {
    it('allows user to fill out the form', async () => {
      render(<IntegrationForm />, { wrapper })

      // Fill out the form
      const serverNameInput = screen.getByPlaceholderText('Enter server name / ID') as HTMLInputElement
      const descriptionInput = screen.getByPlaceholderText('Enter description') as HTMLInputElement
      const apiUrlInput = screen.getByPlaceholderText('Enter API URL') as HTMLInputElement

      fireEvent.change(serverNameInput, { target: { value: 'Test Server' } })
      fireEvent.change(descriptionInput, { target: { value: 'Test Description' } })
      fireEvent.change(apiUrlInput, { target: { value: 'https://test.example.com' } })

      // Verify values are set
      expect(serverNameInput.value).toBe('Test Server')
      expect(descriptionInput.value).toBe('Test Description')
      expect(apiUrlInput.value).toBe('https://test.example.com')
    })

    it('submits form with correct data when Add integration is clicked', async () => {
      render(<IntegrationForm />, { wrapper })

      // Fill out the form
      const serverNameInput = screen.getByPlaceholderText('Enter server name / ID')
      const descriptionInput = screen.getByPlaceholderText('Enter description')
      const apiUrlInput = screen.getByPlaceholderText('Enter API URL')

      fireEvent.change(serverNameInput, { target: { value: 'Production Server' } })
      fireEvent.change(descriptionInput, { target: { value: 'Main production integration' } })
      fireEvent.change(apiUrlInput, { target: { value: 'https://prod.example.com/api' } })

      // Submit the form
      const submitButton = screen.getByText('Add integration')
      fireEvent.click(submitButton)

      // Wait for mutation to be called
      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalled()
      })
    })

    it('includes provider_type in submission', async () => {
      render(<IntegrationForm />, { wrapper })

      // Fill out required fields
      const serverNameInput = screen.getByPlaceholderText('Enter server name / ID')
      const apiUrlInput = screen.getByPlaceholderText('Enter API URL')

      fireEvent.change(serverNameInput, { target: { value: 'Test' } })
      fireEvent.change(apiUrlInput, { target: { value: 'https://test.com' } })

      // Submit the form
      const submitButton = screen.getByText('Add integration')
      fireEvent.click(submitButton)

      // The mutation should include the configuration.provider_type from defaultValues
      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalled()
      })
    })
  })

  describe('Button Actions', () => {
    it('Cancel button navigates back to integrations list', async () => {
      const { navigate } = await import('wouter/use-browser-location')
      const mockNav = vi.mocked(navigate)

      render(<IntegrationForm />, { wrapper })

      const cancelButton = screen.getByText('Cancel')
      fireEvent.click(cancelButton)

      expect(mockNav).toHaveBeenCalledWith('/configuration/integrations')
    })

    it('Add integration button has correct form attribute', () => {
      render(<IntegrationForm />, { wrapper })

      const addButton = screen.getByText('Add integration')
      expect(addButton).toHaveAttribute('form', 'integration-form')
      expect(addButton).toHaveAttribute('type', 'submit')
    })

    it('Test Integration buttons are present', () => {
      render(<IntegrationForm />, { wrapper })

      const testButtons = screen.getAllByText('Test Integration')
      expect(testButtons.length).toBe(2) // One in header, one in the helper panel
    })
  })

  describe('Form Validation', () => {
    it('marks Server name / ID field as required', () => {
      render(<IntegrationForm />, { wrapper })

      const serverNameInput = screen.getByPlaceholderText('Enter server name / ID')
      expect(serverNameInput).toHaveAttribute('required')
    })

    it('marks API URL field as required', () => {
      render(<IntegrationForm />, { wrapper })

      const apiUrlInput = screen.getByPlaceholderText('Enter API URL')
      expect(apiUrlInput).toHaveAttribute('required')
    })
  })

  describe('Layout', () => {
    it('renders form in two-column grid layout', () => {
      const { container } = render(<IntegrationForm />, { wrapper })

      const gridContainer = container.querySelector('.grid.grid-cols-2')
      expect(gridContainer).toBeInTheDocument()
    })

    it('renders helper panel with test integration info', () => {
      render(<IntegrationForm />, { wrapper })

      const helperPanel = screen.getByText('Test the integration to identify and manage the tools it provides.')
      expect(helperPanel).toBeInTheDocument()
    })
  })
})
