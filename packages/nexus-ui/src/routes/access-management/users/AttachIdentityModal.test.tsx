import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { usersClient } from '../../../client'
import { AlertProvider } from '../../../components/alerts'

import { AttachIdentityModal } from './AttachIdentityModal'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../client', () => ({
  usersClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
}))

const mockNavigate = vi.fn<(path: string) => void>()
vi.mock('wouter/use-browser-location', () => ({
  navigate: (path: string): void => {
    mockNavigate(path)
  },
}))

vi.mock('./UserIdentitiesPanel.css', () => ({}))

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockUsers = {
  resources: [
    { id: 'user-1', username: 'alice', email: 'alice@example.com', full_name: 'Alice Smith' },
    { id: 'user-2', username: 'bob', email: 'bob@example.com', full_name: 'Bob Jones' },
  ],
}

const mockIdentities = [
  {
    id: 'id-1',
    user_id: 'user-2',
    identity_provider_id: 'p-1',
    issuer: 'https://idp.example.com',
    subject: 'sub-1',
    created_at: '2026-01-01T00:00:00Z',
    provider_name: 'Azure',
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  currentUserId: 'user-1',
  onAttached: vi.fn(),
}

let mockMutate: ReturnType<typeof vi.fn>

function setupMocks({ identities = mockIdentities }: { identities?: unknown[] } = {}) {
  vi.mocked(usersClient.useQuery).mockImplementation((_method, path) => {
    if (path === '/users') {
      return {
        data: mockUsers,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as never
    }
    // /users/{user_id}/identities
    return {
      data: { resources: identities, next: null, prev: null, total: identities.length },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never
  })

  mockMutate = vi.fn()
  vi.mocked(usersClient.useMutation).mockReturnValue({
    mutate: mockMutate,
    isPending: false,
  } as never)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AttachIdentityModal', () => {
  beforeEach(() => {
    queryClient.clear()
    mockNavigate.mockClear()
    defaultProps.onClose.mockClear()
    defaultProps.onAttached.mockClear()
    setupMocks()
  })

  // ---- Closed state -------------------------------------------------------

  it('does not render modal content when isOpen is false', () => {
    render(<AttachIdentityModal {...defaultProps} isOpen={false} />, { wrapper })

    expect(screen.queryByText('Attach Identity')).not.toBeInTheDocument()
  })

  // ---- Step 1: Users list -------------------------------------------------

  describe('Step 1 - Users list', () => {
    it('shows step 1 description and users table excluding currentUserId', () => {
      render(<AttachIdentityModal {...defaultProps} />, { wrapper })

      expect(screen.getByText('Step 1: Select a user')).toBeInTheDocument()
      // user-1 (alice) is the current user and should be filtered out
      expect(screen.queryByText('alice')).not.toBeInTheDocument()
      // user-2 (bob) should be visible
      expect(screen.getByText('bob')).toBeInTheDocument()
      expect(screen.getByText('bob@example.com')).toBeInTheDocument()
    })

    it('renders Username and Email column headers', () => {
      render(<AttachIdentityModal {...defaultProps} />, { wrapper })

      expect(screen.getByRole('columnheader', { name: /Username/i })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Email/i })).toBeInTheDocument()
    })
  })

  // ---- Step 2: Identities list --------------------------------------------

  describe('Step 2 - Identities list', () => {
    async function selectBob() {
      const user = userEvent.setup()
      render(<AttachIdentityModal {...defaultProps} />, { wrapper })
      // Click on the email cell (not the username link) to trigger onRowClick
      await user.click(screen.getByText('bob@example.com'))
      return user
    }

    it('shows identities table with Provider, Subject, Linked columns after selecting a user', async () => {
      await selectBob()

      expect(screen.getByText('Step 2: Select an identity')).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Provider/i })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Subject/i })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Linked/i })).toBeInTheDocument()
      expect(screen.getByText('Azure')).toBeInTheDocument()
      expect(screen.getByText('sub-1')).toBeInTheDocument()
    })

    it('shows "Back to user list" button and navigates back when clicked', async () => {
      const user = await selectBob()

      const backButton = screen.getByRole('button', { name: 'Back to user list' })
      expect(backButton).toBeInTheDocument()

      await user.click(backButton)

      // Should be back at step 1
      expect(screen.getByText('Step 1: Select a user')).toBeInTheDocument()
    })

    it('shows selected user name as heading', async () => {
      await selectBob()

      expect(screen.getByRole('heading', { name: 'Bob Jones' })).toBeInTheDocument()
    })

    it('shows "No identities" empty state when user has no identities', async () => {
      setupMocks({ identities: [] })
      const user = userEvent.setup()
      render(<AttachIdentityModal {...defaultProps} />, { wrapper })

      await user.click(screen.getByText('bob@example.com'))

      expect(screen.getByText('No identities')).toBeInTheDocument()
      expect(screen.getByText('This user has no federated identities to attach.')).toBeInTheDocument()
    })
  })

  // ---- Attach button ------------------------------------------------------

  describe('Attach button', () => {
    async function goToStep2() {
      const user = userEvent.setup()
      render(<AttachIdentityModal {...defaultProps} />, { wrapper })
      await user.click(screen.getByText('bob@example.com'))
      return user
    }

    it('is disabled when no identity is selected', async () => {
      await goToStep2()

      expect(screen.getByRole('button', { name: 'Attach' })).toBeDisabled()
    })

    it('is enabled after selecting an identity and calls mutate on click', async () => {
      const user = await goToStep2()

      // Click the identity row to select it
      await user.click(screen.getByText('sub-1'))

      const attachButton = screen.getByRole('button', { name: 'Attach' })
      expect(attachButton).toBeEnabled()

      await user.click(attachButton)

      expect(mockMutate).toHaveBeenCalledTimes(1)
      const [body] = mockMutate.mock.calls[0] as unknown[]
      expect(body).toEqual(
        expect.objectContaining({
          params: { path: { user_id: 'user-1' } },
          body: { identity_id: 'id-1' },
        })
      )
    })

    it('deselects identity when clicking a selected row again', async () => {
      const user = await goToStep2()

      // Select
      await user.click(screen.getByText('sub-1'))
      expect(screen.getByRole('button', { name: 'Attach' })).toBeEnabled()

      // Deselect
      await user.click(screen.getByText('sub-1'))
      expect(screen.getByRole('button', { name: 'Attach' })).toBeDisabled()
    })
  })

  // ---- Cancel -------------------------------------------------------------

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup()
    render(<AttachIdentityModal {...defaultProps} />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  // ---- Warning alert ------------------------------------------------------

  describe('Warning alert', () => {
    it('shows warning when both user and identity are selected', async () => {
      const user = userEvent.setup()
      render(<AttachIdentityModal {...defaultProps} />, { wrapper })

      // Select user
      await user.click(screen.getByText('bob@example.com'))
      // Select identity
      await user.click(screen.getByText('sub-1'))

      expect(screen.getByText('This will move the identity to the current user.')).toBeInTheDocument()
      // Warning alert text mentions the selected user will be logged out
      expect(screen.getByText(/will be logged out of any pre-existing sessions/)).toBeInTheDocument()
    })

    it('does not show warning when no identity is selected', async () => {
      const user = userEvent.setup()
      render(<AttachIdentityModal {...defaultProps} />, { wrapper })

      await user.click(screen.getByText('bob@example.com'))

      expect(screen.queryByText('This will move the identity to the current user.')).not.toBeInTheDocument()
    })
  })

  // ---- Mutation callbacks -------------------------------------------------

  describe('Mutation callbacks', () => {
    it('calls onClose and onAttached on successful attach', async () => {
      const user = userEvent.setup()
      render(<AttachIdentityModal {...defaultProps} />, { wrapper })

      await user.click(screen.getByText('bob@example.com'))
      await user.click(screen.getByText('sub-1'))
      await user.click(screen.getByRole('button', { name: 'Attach' }))

      // Invoke the onSuccess callback passed to mutate
      const callbacks = mockMutate.mock.calls[0][1] as { onSuccess: () => void }
      act(() => {
        callbacks.onSuccess()
      })

      await waitFor(() => {
        expect(defaultProps.onClose).toHaveBeenCalled()
        expect(defaultProps.onAttached).toHaveBeenCalled()
      })
    })

    it('shows error alert on attach failure', async () => {
      const user = userEvent.setup()
      render(<AttachIdentityModal {...defaultProps} />, { wrapper })

      await user.click(screen.getByText('bob@example.com'))
      await user.click(screen.getByText('sub-1'))
      await user.click(screen.getByRole('button', { name: 'Attach' }))

      const callbacks = mockMutate.mock.calls[0][1] as { onError: () => void }
      act(() => {
        callbacks.onError()
      })

      await waitFor(() => {
        expect(screen.getByText('Failed to attach identity')).toBeInTheDocument()
      })
    })
  })

  // ---- Username link navigation -------------------------------------------

  it('navigates to user detail when username link is clicked', async () => {
    const user = userEvent.setup()
    render(<AttachIdentityModal {...defaultProps} />, { wrapper })

    // Click the username link (not the row) to trigger navigate
    await user.click(screen.getByRole('button', { name: 'bob' }))

    expect(mockNavigate).toHaveBeenCalledWith('/access-management/users/user-2')
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  // ---- Provider link navigation -------------------------------------------

  it('navigates to identity provider detail when provider link is clicked', async () => {
    const user = userEvent.setup()
    render(<AttachIdentityModal {...defaultProps} />, { wrapper })

    // Go to step 2
    await user.click(screen.getByText('bob@example.com'))
    // Click the provider link
    await user.click(screen.getByRole('button', { name: 'Azure' }))

    expect(mockNavigate).toHaveBeenCalledWith('/access-management/authentication/identity-providers/p-1')
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  // ---- Footer count text --------------------------------------------------

  it('shows user count in footer', () => {
    render(<AttachIdentityModal {...defaultProps} />, { wrapper })

    // Only bob is shown (alice filtered out) - "1 user"
    expect(screen.getByText(/1 user/)).toBeInTheDocument()
  })

  it('shows identity count in footer after selecting user', async () => {
    const user = userEvent.setup()
    render(<AttachIdentityModal {...defaultProps} />, { wrapper })

    await user.click(screen.getByText('bob@example.com'))

    expect(screen.getByText(/1 identity/)).toBeInTheDocument()
  })

  // ---- Accessibility -------------------------------------------------------

  describe('Accessibility', () => {
    it('has no accessibility violations when open', async () => {
      const { container } = render(<AttachIdentityModal {...defaultProps} />, { wrapper })
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })
})
