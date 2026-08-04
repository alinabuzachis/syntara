import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { accessFetchClient } from '../routes/access/accessClient'

import { PermissionGate } from './PermissionGate'

vi.mock('../routes/access/accessClient', () => ({
  accessFetchClient: {
    POST: vi.fn(),
    use: vi.fn(),
  },
}))

vi.mock('../client', () => ({
  authMiddleware: { onRequest: vi.fn() },
  interfaceTagMiddleware: { onRequest: vi.fn() },
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('PermissionGate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders children when permission is granted', async () => {
    vi.mocked(accessFetchClient.POST).mockResolvedValue({ data: { allowed: true } })

    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <PermissionGate action="create" resourceType="workflow">
          <button>Create workflow</button>
        </PermissionGate>
      </Wrapper>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create workflow' })).toBeInTheDocument()
    })
  })

  it('renders nothing when permission is denied and no fallback provided', async () => {
    vi.mocked(accessFetchClient.POST).mockResolvedValue({ data: { allowed: false } })

    const Wrapper = createWrapper()
    const { container } = render(
      <Wrapper>
        <PermissionGate action="delete" resourceType="workflow">
          <button>Delete</button>
        </PermissionGate>
      </Wrapper>
    )

    await waitFor(() => {
      expect(accessFetchClient.POST).toHaveBeenCalled()
    })

    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })

  it('renders fallback when permission is denied', async () => {
    vi.mocked(accessFetchClient.POST).mockResolvedValue({ data: { allowed: false } })

    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <PermissionGate action="delete" resourceType="workflow" fallback={<span>No access</span>}>
          <button>Delete</button>
        </PermissionGate>
      </Wrapper>
    )

    await waitFor(() => {
      expect(screen.getByText('No access')).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('renders nothing while permission check is in flight', () => {
    vi.mocked(accessFetchClient.POST).mockReturnValue(new Promise(() => {}))

    const Wrapper = createWrapper()
    const { container } = render(
      <Wrapper>
        <PermissionGate action="read" resourceType="setting">
          <span>Settings content</span>
        </PermissionGate>
      </Wrapper>
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('has no accessibility violations when children are rendered', async () => {
    vi.mocked(accessFetchClient.POST).mockResolvedValue({ data: { allowed: true } })

    const Wrapper = createWrapper()
    const { container } = render(
      <Wrapper>
        <PermissionGate action="read" resourceType="workflow">
          <button>View workflow</button>
        </PermissionGate>
      </Wrapper>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'View workflow' })).toBeInTheDocument()
    })

    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no accessibility violations when fallback is rendered', async () => {
    vi.mocked(accessFetchClient.POST).mockResolvedValue({ data: { allowed: false } })

    const Wrapper = createWrapper()
    const { container } = render(
      <Wrapper>
        <PermissionGate action="delete" resourceType="workflow" fallback={<p>Access denied</p>}>
          <button>Delete</button>
        </PermissionGate>
      </Wrapper>
    )

    await waitFor(() => {
      expect(screen.getByText('Access denied')).toBeInTheDocument()
    })

    expect(await axe(container)).toHaveNoViolations()
  })
})
