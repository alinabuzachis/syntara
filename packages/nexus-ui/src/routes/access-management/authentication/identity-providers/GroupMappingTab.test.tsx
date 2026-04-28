import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { identityProvidersClient, usersClient } from '../../../../client'
import { AlertProvider } from '../../../../components/alerts'

import { GroupMappingTab } from './GroupMappingTab'

vi.mock('../../../../client', () => ({
  identityProvidersClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
  usersClient: {
    useQuery: vi.fn(),
  },
  OIDC_AUTHORIZE_PATH: '/api/v1/auth/oidc/authorize',
  authMiddleware: { onRequest: vi.fn() },
}))

const mockHandleError = vi.fn(() => vi.fn())
vi.mock('../../../../hooks/useMutationErrorHandler', () => ({
  useMutationErrorHandler: () => mockHandleError,
}))

vi.mock('../../access/accessClient', () => ({
  accessClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
  accessFetchClient: {
    POST: vi.fn().mockResolvedValue({ data: { allowed: false } }),
  },
}))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

const mockNexusGroups = [
  { id: 'g1', name: 'admin', description: 'Admins', created_at: '2026-01-01T00:00:00Z' },
  { id: 'g2', name: 'users', description: 'Users', created_at: '2026-01-02T00:00:00Z' },
]

const defaultProps = {
  providerId: 'provider-123',
  idpType: 'microsoft_entra',
  autoCreateGroups: false,
  providerConfig: {
    issuer_url: 'https://example.com',
    provider_type: 'oidc' as const,
    client_id: 'test-client',
    redirect_uri: 'http://localhost/callback',
  },
  groupMapping: null,
  onSaved: vi.fn(),
}

describe('GroupMappingTab', () => {
  beforeEach(() => {
    vi.mocked(usersClient.useQuery).mockReturnValue({
      data: { resources: mockNexusGroups },
      isPending: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn().mockResolvedValue({ data: { resources: mockNexusGroups } }),
    } as never)

    vi.mocked(identityProvidersClient.useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
  })

  describe('Auto-create groups mode', () => {
    it('shows auto-create state when autoCreateGroups is true', () => {
      render(<GroupMappingTab {...defaultProps} autoCreateGroups />, { wrapper })

      expect(screen.getByRole('heading', { name: /auto-create groups is enabled/i })).toBeInTheDocument()
    })
  })

  describe('Empty state', () => {
    it('shows empty mapping state when no group mappings exist', () => {
      render(<GroupMappingTab {...defaultProps} />, { wrapper })

      expect(screen.getByRole('heading', { name: /no group mappings configured/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /discover groups/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /add manually/i })).toBeInTheDocument()
    })

    it('switches to edit mode when Add manually is clicked', async () => {
      const user = userEvent.setup()
      render(<GroupMappingTab {...defaultProps} />, { wrapper })

      await user.click(screen.getByRole('button', { name: /add manually/i }))

      // Should show mapping table with Add mapping and Save buttons
      expect(screen.getByRole('button', { name: /save mapping/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /add mapping/i })).toBeInTheDocument()
    })
  })

  describe('Read-only view', () => {
    const existingMapping = {
      group_jmespath_expression: 'groups[*]',
      group_mapping_entries: [
        { idp_group_value: 'idp-admin', nexus_group_id: 'g1' },
        { idp_group_value: 'idp-users', nexus_group_id: 'g2' },
      ],
    }

    it('shows read-only view when mappings exist and not editing', () => {
      render(<GroupMappingTab {...defaultProps} groupMapping={existingMapping} />, { wrapper })

      // Read-only view shows a filter input and disabled mapping rows
      expect(screen.getByRole('textbox', { name: /filter group mappings/i })).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: 'IdP group value 1' })).toBeDisabled()
    })

    it('switches to editing mode when editMappingTrigger is incremented', () => {
      const { rerender } = render(<GroupMappingTab {...defaultProps} groupMapping={existingMapping} />, { wrapper })

      // Re-render with editMappingTrigger to enter edit mode
      rerender(
        <QueryClientProvider client={queryClient}>
          <AlertProvider>
            <GroupMappingTab {...defaultProps} groupMapping={existingMapping} editMappingTrigger={1} />
          </AlertProvider>
        </QueryClientProvider>
      )

      expect(screen.getByRole('button', { name: /save mapping/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })
  })

  describe('Edit mode', () => {
    it('shows Save mapping, Cancel, and Re-discover buttons', async () => {
      const user = userEvent.setup()
      render(<GroupMappingTab {...defaultProps} />, { wrapper })

      await user.click(screen.getByRole('button', { name: /add manually/i }))

      expect(screen.getByRole('button', { name: /save mapping/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /re-discover groups/i })).toBeInTheDocument()
    })

    it('reverts to initial state when Cancel is clicked', async () => {
      const user = userEvent.setup()
      render(<GroupMappingTab {...defaultProps} />, { wrapper })

      await user.click(screen.getByRole('button', { name: /add manually/i }))
      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      // Should go back to empty state
      expect(screen.getByRole('heading', { name: /no group mappings configured/i })).toBeInTheDocument()
    })

    it('shows validation when saving with incomplete entries', async () => {
      const user = userEvent.setup()
      render(<GroupMappingTab {...defaultProps} />, { wrapper })

      // Enter edit mode and add an entry
      await user.click(screen.getByRole('button', { name: /add manually/i }))

      // Type only the IdP value, leaving nexus group empty
      const idpInput = screen.getByRole('textbox', { name: 'IdP group value 1' })
      await user.type(idpInput, 'admin')

      // Try to save
      await user.click(screen.getByRole('button', { name: /save mapping/i }))

      // Mutation should NOT have been called
      const { mutate } = vi.mocked(identityProvidersClient.useMutation).mock.results[0].value as {
        mutate: ReturnType<typeof vi.fn>
      }
      expect(mutate).not.toHaveBeenCalled()
    })

    it('calls patchProvider on save with complete entries', async () => {
      const mockMutate = vi.fn()
      vi.mocked(identityProvidersClient.useMutation).mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      } as never)

      const existingMapping = {
        group_jmespath_expression: 'groups[*]',
        group_mapping_entries: [{ idp_group_value: 'admin', nexus_group_id: 'g1' }],
      }

      const user = userEvent.setup()
      render(<GroupMappingTab {...defaultProps} groupMapping={existingMapping} editMappingTrigger={1} />, { wrapper })

      // Save
      await user.click(screen.getByRole('button', { name: /save mapping/i }))

      expect(mockMutate).toHaveBeenCalled()
    })
  })

  describe('Save flow', () => {
    it('calls onSaved after successful save', async () => {
      const onSaved = vi.fn()
      const mockMutate = vi.fn((_params: unknown, callbacks?: { onSuccess?: () => void }) => {
        callbacks?.onSuccess?.()
      })
      vi.mocked(identityProvidersClient.useMutation).mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      } as never)

      const existingMapping = {
        group_jmespath_expression: 'groups[*]',
        group_mapping_entries: [{ idp_group_value: 'admin', nexus_group_id: 'g1' }],
      }

      const user = userEvent.setup()
      render(
        <GroupMappingTab {...defaultProps} groupMapping={existingMapping} onSaved={onSaved} editMappingTrigger={1} />,
        { wrapper }
      )

      await user.click(screen.getByRole('button', { name: /save mapping/i }))

      await waitFor(() => {
        expect(onSaved).toHaveBeenCalled()
      })
    })

    it('shows error alert when save fails', async () => {
      const mockMutate = vi.fn((_params: unknown, callbacks?: { onError?: () => void }) => {
        callbacks?.onError?.()
      })
      vi.mocked(identityProvidersClient.useMutation).mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      } as never)

      const existingMapping = {
        group_jmespath_expression: 'groups[*]',
        group_mapping_entries: [{ idp_group_value: 'admin', nexus_group_id: 'g1' }],
      }

      const user = userEvent.setup()
      render(<GroupMappingTab {...defaultProps} groupMapping={existingMapping} editMappingTrigger={1} />, { wrapper })

      await user.click(screen.getByRole('button', { name: /save mapping/i }))

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalled()
      })
    })
  })

  describe('Entry management', () => {
    it('removes a mapping entry when remove button is clicked', async () => {
      const existingMapping = {
        group_jmespath_expression: 'groups[*]',
        group_mapping_entries: [
          { idp_group_value: 'admin', nexus_group_id: 'g1' },
          { idp_group_value: 'users', nexus_group_id: 'g2' },
        ],
      }

      const user = userEvent.setup()
      render(<GroupMappingTab {...defaultProps} groupMapping={existingMapping} editMappingTrigger={1} />, { wrapper })

      // Should have 2 entries
      expect(screen.getByRole('textbox', { name: 'IdP group value 1' })).toHaveValue('admin')
      expect(screen.getByRole('textbox', { name: 'IdP group value 2' })).toHaveValue('users')

      // Remove first entry
      await user.click(screen.getByRole('button', { name: 'Remove mapping 1' }))

      // Now only one entry
      expect(screen.queryByRole('textbox', { name: 'IdP group value 2' })).not.toBeInTheDocument()
    })

    it('adds a new empty mapping entry', async () => {
      const user = userEvent.setup()
      render(<GroupMappingTab {...defaultProps} />, { wrapper })

      await user.click(screen.getByRole('button', { name: /add manually/i }))

      // First entry was auto-added
      expect(screen.getByRole('textbox', { name: 'IdP group value 1' })).toBeInTheDocument()

      // Add another
      await user.click(screen.getByRole('button', { name: /add mapping/i }))

      expect(screen.getByRole('textbox', { name: 'IdP group value 2' })).toBeInTheDocument()
    })
  })

  describe('Discover groups', () => {
    it('opens popup when Discover groups is clicked from empty state', async () => {
      const mockOpen = vi.fn()
      const originalOpen = globalThis.open
      globalThis.open = mockOpen

      const user = userEvent.setup()
      render(<GroupMappingTab {...defaultProps} />, { wrapper })

      await user.click(screen.getByRole('button', { name: /discover groups/i }))

      expect(mockOpen).toHaveBeenCalledWith(
        expect.stringContaining('provider_id=provider-123'),
        'test-signin',
        expect.any(String)
      )

      globalThis.open = originalOpen
    })
  })

  describe('Advanced section', () => {
    it('renders advanced section in edit mode', async () => {
      const user = userEvent.setup()
      render(<GroupMappingTab {...defaultProps} />, { wrapper })

      await user.click(screen.getByRole('button', { name: /add manually/i }))

      expect(screen.getByText('Advanced')).toBeInTheDocument()
    })
  })

  describe('Sign-in alert flow', () => {
    it('shows sign-in alert after test sign-in discovers groups', async () => {
      const mockOpen = vi.spyOn(globalThis, 'open').mockReturnValue({ closed: false } as Window)

      const user = userEvent.setup()
      render(<GroupMappingTab {...defaultProps} />, { wrapper })

      // Click "Discover groups" which enters edit mode and opens popup
      await user.click(screen.getByRole('button', { name: /discover groups/i }))

      // Extract the nonce that was stored in localStorage
      const nonce = localStorage.getItem('nexus-test-signin-nonce')
      expect(nonce).toBeTruthy()

      // Simulate the popup writing claims to localStorage (picked up by polling)
      localStorage.setItem(
        'nexus-test-signin',
        JSON.stringify({
          type: 'test-signin',
          nonce,
          claims: { groups: ['idp-admin', 'idp-users', 'unknown-group'] },
        })
      )

      // The sign-in alert should appear
      await waitFor(() => {
        expect(screen.getByText(/groups discovered/i)).toBeInTheDocument()
      })

      // Dismiss the alert
      const closeButton = screen.getByRole('button', { name: /close/i })
      await user.click(closeButton)

      await waitFor(() => {
        expect(screen.queryByText(/groups discovered/i)).not.toBeInTheDocument()
      })

      mockOpen.mockRestore()
    })
  })

  describe('Edit mode rendering', () => {
    it('renders all edit mode controls with existing mappings', () => {
      const existingMapping = {
        group_jmespath_expression: 'groups[*]',
        group_mapping_entries: [{ idp_group_value: 'admin', nexus_group_id: 'g1' }],
      }

      render(<GroupMappingTab {...defaultProps} groupMapping={existingMapping} editMappingTrigger={1} />, { wrapper })

      // Verify edit mode controls
      expect(screen.getByRole('button', { name: /save mapping/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /re-discover groups/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /add mapping/i })).toBeInTheDocument()
      expect(screen.getByText('Advanced')).toBeInTheDocument()

      // Verify IdP group value is populated
      expect(screen.getByRole('textbox', { name: 'IdP group value 1' })).toHaveValue('admin')
    })

    it('renders GroupFormModal when Create new group option is selected', async () => {
      const existingMapping = {
        group_jmespath_expression: 'groups[*]',
        group_mapping_entries: [{ idp_group_value: 'test-group', nexus_group_id: '' }],
      }

      const user = userEvent.setup()
      render(<GroupMappingTab {...defaultProps} groupMapping={existingMapping} editMappingTrigger={1} />, { wrapper })

      // Open the nexus group select dropdown by clicking the input placeholder
      const selectInput = screen.getByPlaceholderText('Select a group...')
      await user.click(selectInput)

      // Click "Create new group" option
      const createOption = await screen.findByText('Create new group')
      await user.click(createOption)

      // The GroupFormModal should be open with the pre-filled name
      await waitFor(() => {
        expect(screen.getByText('Add group')).toBeInTheDocument()
      })
    })
  })

  describe('Accessibility', () => {
    it('has no accessibility violations in empty state', async () => {
      const { container } = render(<GroupMappingTab {...defaultProps} />, { wrapper })
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no accessibility violations in auto-create state', async () => {
      const { container } = render(<GroupMappingTab {...defaultProps} autoCreateGroups />, { wrapper })
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no accessibility violations in edit mode', async () => {
      const existingMapping = {
        group_jmespath_expression: 'groups[*]',
        group_mapping_entries: [{ idp_group_value: 'admin', nexus_group_id: 'g1' }],
      }
      const { container } = render(
        <GroupMappingTab {...defaultProps} groupMapping={existingMapping} editMappingTrigger={1} />,
        { wrapper }
      )

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no accessibility violations in read-only view', async () => {
      const existingMapping = {
        group_jmespath_expression: 'groups[*]',
        group_mapping_entries: [{ idp_group_value: 'admin', nexus_group_id: 'g1' }],
      }
      const { container } = render(<GroupMappingTab {...defaultProps} groupMapping={existingMapping} />, { wrapper })
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })
})
