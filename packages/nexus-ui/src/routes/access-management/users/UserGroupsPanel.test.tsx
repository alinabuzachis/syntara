import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { usersClient } from '../../../client'
import { AlertProvider } from '../../../components/alerts'
import { formatDateTime } from '../../../utils/dateUtils'

import { UserGroupsPanel } from './UserGroupsPanel'

vi.mock('../../../client', () => ({
  usersClient: { useQuery: vi.fn() },
}))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

const mockGroups = [
  {
    id: 'g1',
    name: 'platform-admins',
    description: 'Full admins',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  },
  {
    id: 'g2',
    name: 'developers',
    description: null,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-16T00:00:00Z',
  },
]

describe('UserGroupsPanel', () => {
  beforeEach(() => {
    vi.mocked(usersClient.useQuery).mockReturnValue({
      data: { resources: mockGroups },
      isPending: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as never)
  })

  describe('Rendering', () => {
    it('renders group table with data', () => {
      render(<UserGroupsPanel userId="user-123" />, { wrapper })

      expect(screen.getByRole('grid', { name: 'User groups table' })).toBeInTheDocument()
      expect(screen.getByText('platform-admins')).toBeInTheDocument()
      expect(screen.getByText('developers')).toBeInTheDocument()
    })

    it('renders table column headers', () => {
      render(<UserGroupsPanel userId="user-123" />, { wrapper })

      expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: 'Description' })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: 'Created' })).toBeInTheDocument()
    })

    it('displays group names in each row', () => {
      render(<UserGroupsPanel userId="user-123" />, { wrapper })

      const table = screen.getByRole('grid', { name: 'User groups table' })
      const rows = within(table).getAllByRole('row')
      // rows[0] is the header row
      expect(within(rows[1]).getByText('platform-admins')).toBeInTheDocument()
      expect(within(rows[2]).getByText('developers')).toBeInTheDocument()
    })

    it('displays group descriptions and handles null description', () => {
      render(<UserGroupsPanel userId="user-123" />, { wrapper })

      expect(screen.getByText('Full admins')).toBeInTheDocument()
      // null description renders as empty string, so the row renders without error
      expect(screen.getByText('developers')).toBeInTheDocument()
    })

    it('displays formatted created dates', () => {
      render(<UserGroupsPanel userId="user-123" />, { wrapper })

      const expectedDate1 = formatDateTime('2026-01-01T00:00:00Z')
      const expectedDate2 = formatDateTime('2026-01-15T00:00:00Z')

      expect(screen.getByText(expectedDate1)).toBeInTheDocument()
      expect(screen.getByText(expectedDate2)).toBeInTheDocument()
    })
  })

  describe('Empty State', () => {
    it('shows "No groups" empty state when no groups returned', () => {
      vi.mocked(usersClient.useQuery).mockReturnValue({
        data: { resources: [] },
        isPending: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
      } as never)

      render(<UserGroupsPanel userId="user-123" />, { wrapper })

      expect(screen.getByText('No groups')).toBeInTheDocument()
      expect(screen.getByText('This user is not a member of any groups.')).toBeInTheDocument()
    })
  })

  describe('Loading State', () => {
    it('shows loading state when pending', () => {
      vi.mocked(usersClient.useQuery).mockReturnValue({
        data: null,
        isPending: true,
        isError: false,
        error: null,
      })

      render(<UserGroupsPanel userId="user-123" />, { wrapper })

      expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeInTheDocument()
    })
  })

  describe('Error State', () => {
    it('shows error state on error', () => {
      const mockError = new Error('Failed to load groups')
      vi.mocked(usersClient.useQuery).mockReturnValue({
        data: null,
        isPending: false,
        isError: true,
        error: mockError,
      })

      render(<UserGroupsPanel userId="user-123" />, { wrapper })

      expect(screen.getByRole('heading', { name: 'Error loading groups' })).toBeInTheDocument()
    })
  })

  describe('API Integration', () => {
    it('passes userId to the query', () => {
      render(<UserGroupsPanel userId="abc-456" />, { wrapper })

      expect(usersClient.useQuery).toHaveBeenCalledWith(
        'get',
        '/users/{user_id}/groups',
        expect.objectContaining({
          params: { path: { user_id: 'abc-456' } },
        })
      )
    })
  })

  describe('Accessibility', () => {
    it('has no accessibility violations with group data', async () => {
      const { container } = render(<UserGroupsPanel userId="user-123" />, { wrapper })

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no accessibility violations in empty state', async () => {
      vi.mocked(usersClient.useQuery).mockReturnValue({
        data: { resources: [] },
        isPending: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
      } as never)

      const { container } = render(<UserGroupsPanel userId="user-123" />, { wrapper })

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })
})
