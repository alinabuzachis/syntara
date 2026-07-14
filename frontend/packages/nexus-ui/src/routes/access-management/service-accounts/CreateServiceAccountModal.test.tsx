import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { AlertProvider } from '../../../providers/alerts'
import { accessClient } from '../../access/accessClient'
import { useAllProjects } from '../../access/useAllProjects'

import { CreateServiceAccountModal } from './CreateServiceAccountModal'

vi.mock('../../../client', () => ({
  authMiddleware: { onRequest: vi.fn() },
}))

vi.mock('../../access/accessClient', () => ({
  accessClient: {
    useMutation: vi.fn(),
  },
}))

vi.mock('../../access/useAllProjects', () => ({
  useAllProjects: vi.fn(),
}))

vi.mock('../../../hooks/routing/navigate', () => ({
  navigate: vi.fn(),
}))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

describe('CreateServiceAccountModal', () => {
  const mockCreateSAMutate = vi.fn()
  const mockCreateCredMutate = vi.fn()
  const mockOnClose = vi.fn()
  const mockOnSuccess = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useAllProjects).mockReturnValue({
      projects: [
        { id: '550e8400-e29b-41d4-a716-446655440000', name: 'Project Alpha' },
        { id: '660e8400-e29b-41d4-a716-446655440001', name: 'Project Beta' },
      ],
    } as ReturnType<typeof useAllProjects>)

    vi.mocked(accessClient.useMutation).mockImplementation(((_method: string, endpoint: string) => {
      if (endpoint === '/service_accounts') {
        return {
          mutate: mockCreateSAMutate,
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
      return {
        mutate: mockCreateCredMutate,
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
    }) as never)
  })

  describe('Form Phase', () => {
    it('renders with "Create service account" title', () => {
      render(<CreateServiceAccountModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />, { wrapper })

      expect(screen.getByRole('heading', { name: 'Create service account' })).toBeInTheDocument()
    })

    it('renders project select, name, and description fields', () => {
      render(<CreateServiceAccountModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />, { wrapper })

      expect(screen.getByRole('button', { name: 'Select a project' })).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: 'Description' })).toBeInTheDocument()
    })

    it('populates project dropdown with available projects', async () => {
      const user = userEvent.setup()
      render(<CreateServiceAccountModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'Select a project' }))

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Project Alpha' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Project Beta' })).toBeInTheDocument()
      })
    })

    it('shows validation error when required fields are empty', async () => {
      const user = userEvent.setup()
      render(<CreateServiceAccountModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'Create service account' }))

      await waitFor(() => {
        expect(screen.getByText('Name is required')).toBeInTheDocument()
      })
      expect(mockCreateSAMutate).not.toHaveBeenCalled()
    })

    it('calls create mutation with correct body on submit', async () => {
      const user = userEvent.setup()
      render(<CreateServiceAccountModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'Select a project' }))
      await user.click(await screen.findByRole('option', { name: 'Project Alpha' }))

      await user.type(screen.getByRole('textbox', { name: 'Name' }), 'my-new-sa')
      await user.type(screen.getByRole('textbox', { name: 'Description' }), 'Test account')

      await user.click(screen.getByRole('button', { name: 'Create service account' }))

      await waitFor(() => {
        expect(mockCreateSAMutate).toHaveBeenCalled()
        const callArgs = mockCreateSAMutate.mock.calls[0]
        expect(callArgs[0]).toEqual({
          body: {
            name: 'my-new-sa',
            description: 'Test account',
            project_id: '550e8400-e29b-41d4-a716-446655440000',
          },
        })
      })
    })

    it('calls onClose when Cancel button is clicked', async () => {
      const user = userEvent.setup()
      render(<CreateServiceAccountModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('does not render form content when closed', () => {
      render(<CreateServiceAccountModal isOpen={false} onClose={mockOnClose} onSuccess={mockOnSuccess} />, { wrapper })

      expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument()
    })
  })

  describe('Credentials Reveal Phase', () => {
    it('transitions to credential phase after successful create + credential', async () => {
      const user = userEvent.setup()
      render(<CreateServiceAccountModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'Select a project' }))
      await user.click(await screen.findByRole('option', { name: 'Project Alpha' }))

      await user.type(screen.getByRole('textbox', { name: 'Name' }), 'my-new-sa')
      await user.click(screen.getByRole('button', { name: 'Create service account' }))

      await waitFor(() => {
        expect(mockCreateSAMutate).toHaveBeenCalled()
      })

      await waitFor(() => {
        const saCallbacks = mockCreateSAMutate.mock.calls[0][1] as { onSuccess: (data: unknown) => void }
        saCallbacks.onSuccess({ id: 'sa-new', name: 'my-new-sa', status: 'active' })
      })

      await waitFor(() => {
        expect(mockCreateCredMutate).toHaveBeenCalled()
      })

      await waitFor(() => {
        const credCallbacks = mockCreateCredMutate.mock.calls[0][1] as { onSuccess: (data: unknown) => void }
        credCallbacks.onSuccess({ identifier: 'cid-123', client_secret: 'secret-456' })
      })

      expect(screen.getByRole('heading', { name: 'Service account created' })).toBeInTheDocument()
      expect(screen.getByText('Save these credentials now')).toBeInTheDocument()
      expect(mockOnSuccess).toHaveBeenCalled()
    })
  })

  describe('Accessibility', () => {
    it('has no accessibility violations in form phase', async () => {
      const { container } = render(
        <CreateServiceAccountModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />,
        { wrapper }
      )

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })
})
