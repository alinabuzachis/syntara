import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { usersClient } from '../../../client'
import { AlertProvider } from '../../../components/alerts'

import { EditUser } from './EditUser'

vi.mock('../../../client', () => ({
  authClient: {
    useQuery: vi.fn().mockReturnValue({ data: undefined, isPending: false, isError: false, error: null }),
    useMutation: vi.fn(),
  },
  usersClient: { useQuery: vi.fn(), useMutation: vi.fn() },
  authMiddleware: { onRequest: vi.fn() },
}))

vi.mock('wouter', () => ({
  useLocation: () => ['/', vi.fn()],
  useParams: () => ({ userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}))

vi.mock('wouter/use-browser-location', () => ({
  navigate: vi.fn(),
}))

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

describe('EditUser', () => {
  it('renders the edit user form', () => {
    vi.mocked(usersClient.useQuery).mockReturnValue({
      data: {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        username: 'jdoe',
        email: 'jdoe@nexus.local',
        full_name: 'John Doe',
        role: 'creator',
        is_active: true,
      },
      isPending: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as never)
    vi.mocked(usersClient.useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)

    render(<EditUser />, { wrapper })

    expect(screen.getByRole('heading', { name: 'Edit User' })).toBeInTheDocument()
  })
})
