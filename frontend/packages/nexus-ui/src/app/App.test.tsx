import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import App from './App'

// Mock auth store so AppLogin immediately renders its children
vi.mock('../stores/useAuthStore', () => ({
  useAuthStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        isAuthenticated: true,
        isRefreshing: false,
        error: null,
        login: vi.fn(),
        refresh: vi.fn(),
        logout: vi.fn(),
      }),
    { setState: vi.fn(), getState: vi.fn(() => ({})) }
  ),
  selectIsAuthenticated: (state: { isAuthenticated: boolean }) => state.isAuthenticated,
  selectIsRefreshing: (state: { isRefreshing: boolean }) => state.isRefreshing,
}))

// Mock useAuthProviders to prevent async fetch + state updates
vi.mock('./useAuthProviders', () => ({
  useAuthProviders: () => ({ providers: [], isLoading: false }),
}))

describe('App', () => {
  it('renders without crashing', async () => {
    render(<App />)
    await waitFor(() => {
      expect(document.body).toBeInTheDocument()
    })
  })

  it('renders the main application structure', async () => {
    render(<App />)
    // Compass layout renders a banner (docked masthead)
    await waitFor(() => {
      expect(screen.getByRole('banner')).toBeInTheDocument()
    })
  })

  it('renders navigation dock', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
    })
  })

  it('renders main landmark region', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getByRole('main')).toBeInTheDocument()
    })
  })
})
