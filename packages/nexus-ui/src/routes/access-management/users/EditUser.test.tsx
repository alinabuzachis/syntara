import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { authClient } from '../../../client'
import { AlertProvider } from '../../../components/alerts'
import { accessClient } from '../../access/accessClient'

import { EditUser } from './EditUser'

vi.mock('../../../client', () => ({
  authClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
  authMiddleware: { onRequest: vi.fn() },
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

vi.mock('wouter', () => ({
  useLocation: () => ['/', vi.fn()],
  useParams: () => ({ userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}))

vi.mock('wouter/use-browser-location', () => ({
  navigate: vi.fn(),
}))

const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

const mockUserData = {
  id: VALID_UUID,
  username: 'jdoe',
  email: 'jdoe@nexus.local',
  full_name: 'John Doe',
  is_enabled: true,
}

function setupSuccessMocks() {
  vi.mocked(authClient.useQuery).mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  } as never)
  vi.mocked(accessClient.useQuery).mockReturnValue({
    data: mockUserData,
    isPending: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  } as never)
  vi.mocked(accessClient.useMutation).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as never)
}

describe('EditUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
  })

  it('renders the edit user form with heading and save button', () => {
    setupSuccessMocks()
    render(<EditUser />, { wrapper })

    expect(screen.getByRole('heading', { name: 'Edit User' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    setupSuccessMocks()
    const { container } = render(<EditUser />, { wrapper })

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
