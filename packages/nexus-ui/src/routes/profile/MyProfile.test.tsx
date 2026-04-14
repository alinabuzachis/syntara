import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { authClient } from '../../client'
import { useQueryState } from '../../components/states/useQueryState'

import { MyProfile } from './MyProfile'

vi.mock('../../client', () => ({
  authClient: {
    useQuery: vi.fn(),
  },
}))

vi.mock('../../components/states/useQueryState', () => ({
  useQueryState: vi.fn(),
}))

interface MockProfile {
  id: string
  username: string
  email: string
  groups: string[]
}

function mockProfileQuery(profile: MockProfile | null, isPending = false, error: unknown = null) {
  vi.mocked(authClient.useQuery).mockReturnValue({
    data: profile,
    isPending,
    error,
    isError: !!error,
    refetch: vi.fn(),
  } as never)
}

describe('MyProfile', () => {
  const defaultProfile: MockProfile = {
    id: 'user-123',
    username: 'demo',
    email: 'demo@example.com',
    groups: ['developers', 'operators'],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useQueryState).mockReturnValue(null)
  })

  it('shows loading state when query is pending', () => {
    // Arrange
    mockProfileQuery(null, true)
    vi.mocked(useQueryState).mockReturnValue(<div data-testid="loading">Loading...</div>)

    // Act
    render(<MyProfile />)

    // Assert
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('shows error state when query fails', () => {
    // Arrange
    mockProfileQuery(null, false, { message: 'Network error' })
    vi.mocked(useQueryState).mockReturnValue(<div>Error loading profile</div>)

    // Act
    render(<MyProfile />)

    // Assert
    expect(screen.getByText('Error loading profile')).toBeInTheDocument()
  })

  it('renders profile card with user data when loaded', () => {
    // Arrange
    mockProfileQuery(defaultProfile)

    // Act
    render(<MyProfile />)

    // Assert
    expect(screen.getByRole('heading', { name: 'My Profile' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'demo' })).toBeInTheDocument()
    // Email appears in both the header area and the description list
    const emails = screen.getAllByText('demo@example.com')
    expect(emails).toHaveLength(2)
    expect(screen.getByText('user-123')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Account details' })).toBeInTheDocument()
  })

  it('shows avatar with correct initials for single-part username', () => {
    // Arrange - "demo" should produce "D"
    mockProfileQuery(defaultProfile)

    // Act
    render(<MyProfile />)

    // Assert
    expect(screen.getByText('D')).toBeInTheDocument()
  })

  it('shows avatar with correct initials for multi-part username', () => {
    // Arrange - "john.doe" should produce "JD"
    mockProfileQuery({ ...defaultProfile, username: 'john.doe' })

    // Act
    render(<MyProfile />)

    // Assert
    expect(screen.getByText('JD')).toBeInTheDocument()
  })

  it('shows avatar with correct initials for hyphenated username', () => {
    // Arrange - "alice-bob" should produce "AB"
    mockProfileQuery({ ...defaultProfile, username: 'alice-bob' })

    // Act
    render(<MyProfile />)

    // Assert
    expect(screen.getByText('AB')).toBeInTheDocument()
  })

  it('shows avatar with correct initials for underscore-separated username', () => {
    // Arrange - "first_second_third" should produce "FS" (only first 2 parts)
    mockProfileQuery({ ...defaultProfile, username: 'first_second_third' })

    // Act
    render(<MyProfile />)

    // Assert
    expect(screen.getByText('FS')).toBeInTheDocument()
  })

  it('shows groups as Labels', () => {
    // Arrange
    mockProfileQuery(defaultProfile)

    // Act
    render(<MyProfile />)

    // Assert
    expect(screen.getByText('developers')).toBeInTheDocument()
    expect(screen.getByText('operators')).toBeInTheDocument()
  })

  it('shows "No groups assigned" when groups array is empty', () => {
    // Arrange
    mockProfileQuery({ ...defaultProfile, groups: [] })

    // Act
    render(<MyProfile />)

    // Assert
    expect(screen.getByText('No groups assigned')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    // Arrange
    const { axe } = await import('vitest-axe')
    mockProfileQuery(defaultProfile)

    // Act
    const { container } = render(<MyProfile />)

    // Assert
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
