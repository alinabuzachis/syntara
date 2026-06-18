import { RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import App from './App'
import { isTanStackRouter } from './routerFlag'

// Mock the router flag so we can control which router path is taken per test.
// Default: vi.fn() returns undefined (falsy) → wouter path; set .mockReturnValue(true)
// inside a test/beforeEach to exercise the TanStack branch.
vi.mock('./routerFlag', () => ({ isTanStackRouter: vi.fn() }))

// Stub out the real TanStack router instance (avoids building the full route tree).
vi.mock('./tanstackRouter', () => ({ tanstackRouter: {} }))

// Override RouterProvider so we can check it was called without needing a real router.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, RouterProvider: vi.fn() }
})

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

describe('App (TanStack router path)', () => {
  beforeEach(() => {
    vi.mocked(isTanStackRouter).mockReturnValue(true)
    // RouterProvider is typed to return JSX.Element, but null is valid in tests
    // where we only care that it was called, not what it renders.
    vi.mocked(RouterProvider).mockReturnValue(null as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders RouterProvider when TanStack router is active', () => {
    render(<App />)
    expect(vi.mocked(RouterProvider)).toHaveBeenCalled()
  })
})
