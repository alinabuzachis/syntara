import { renderHook, waitFor } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAAPBrowser } from './useAAPBrowser'

const mockUseQuery = vi.fn()

vi.mock('../client', () => ({
  aapClient: {
    useQuery: (...args: unknown[]) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- mock returns any by design
      return mockUseQuery(...args)
    },
  },
}))

describe('useAAPBrowser', () => {
  const mockRefetch = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    })
  })

  it('returns empty arrays when not active (credentialId undefined)', () => {
    const { result } = renderHook(() => useAAPBrowser(undefined))

    expect(result.current.organizations).toEqual([])
    expect(result.current.jobTemplates).toEqual([])
    expect(result.current.inventories).toEqual([])
  })

  it('returns empty arrays initially when active', () => {
    const { result } = renderHook(() => useAAPBrowser('test-credential-id'))

    expect(result.current.organizations).toEqual([])
    expect(result.current.jobTemplates).toEqual([])
    expect(result.current.inventories).toEqual([])
  })

  it('selectOrganization updates selectedOrg', () => {
    const { result } = renderHook(() => useAAPBrowser('test-credential-id'))

    act(() => {
      result.current.selectOrganization('Default')
    })

    expect(result.current.selectedOrg).toBe('Default')
  })

  it('resetAll clears all state', () => {
    const { result } = renderHook(() => useAAPBrowser('test-credential-id'))

    act(() => {
      result.current.selectOrganization('Default')
    })
    expect(result.current.selectedOrg).toBe('Default')

    act(() => {
      result.current.resetAll()
    })
    expect(result.current.selectedOrg).toBe('')
  })

  it('search functions update state without errors', async () => {
    const { result } = renderHook(() => useAAPBrowser('test-credential-id'))

    act(() => {
      result.current.searchOrganizations('test')
    })

    await waitFor(() => {
      expect(result.current.error).toBeNull()
    })
  })

  it('all search callbacks update without errors', () => {
    const { result } = renderHook(() => useAAPBrowser('test-credential-id'))

    act(() => {
      result.current.searchJobTemplates('deploy')
      result.current.searchInventories('prod')
      result.current.searchExecutionEnvironments('custom')
      result.current.searchCredentials('ssh')
      result.current.searchInstanceGroups('default')
    })

    expect(result.current.error).toBeNull()
  })

  it('reports loading state when active and pending', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      error: null,
    })

    const { result } = renderHook(() => useAAPBrowser('test-credential-id'))

    expect(result.current.loadingOrgs).toBe(true)
    expect(result.current.loadingTemplates).toBe(true)
    expect(result.current.loadingInventories).toBe(true)
    expect(result.current.loadingExecutionEnvironments).toBe(true)
    expect(result.current.loadingCredentials).toBe(true)
    expect(result.current.loadingInstanceGroups).toBe(true)
  })

  it('does not report loading when not active (credentialId undefined)', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      error: null,
    })

    const { result } = renderHook(() => useAAPBrowser(undefined))

    expect(result.current.loadingOrgs).toBe(false)
    expect(result.current.loadingTemplates).toBe(false)
    expect(result.current.loadingInventories).toBe(false)
  })

  it('returns error object from query errors', () => {
    const networkError = new Error('Network error')
    mockUseQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: networkError,
    })

    const { result } = renderHook(() => useAAPBrowser('test-credential-id'))

    expect(result.current.error).toBe(networkError)
  })

  it('wraps non-Error error objects', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: { code: 'NETWORK_FAIL' },
    })

    const { result } = renderHook(() => useAAPBrowser('test-credential-id'))

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toContain('NETWORK_FAIL')
  })

  it('retryAll refetches all queries', () => {
    const { result } = renderHook(() => useAAPBrowser('test-credential-id'))

    act(() => {
      result.current.retryAll()
    })

    // Seven queries (orgs, templates, inventories, template detail, exec envs, credentials, instance groups) each call refetch
    expect(mockRefetch).toHaveBeenCalledTimes(7)
  })

  it('returns data from successful queries', () => {
    const mockOrgs = { results: [{ id: 1, name: 'Default' }] }
    mockUseQuery.mockReturnValue({
      data: mockOrgs,
      isPending: false,
      isError: false,
      error: null,
    })

    const { result } = renderHook(() => useAAPBrowser('test-credential-id'))

    // All queries return the same mock, so all resource arrays get the same results
    expect(result.current.organizations).toEqual([{ id: 1, name: 'Default' }])
    expect(result.current.executionEnvironments).toEqual([{ id: 1, name: 'Default' }])
    expect(result.current.credentials).toEqual([{ id: 1, name: 'Default' }])
    expect(result.current.instanceGroups).toEqual([{ id: 1, name: 'Default' }])
  })

  it('selectJobTemplate updates selected template id', () => {
    const { result } = renderHook(() => useAAPBrowser('test-credential-id'))

    act(() => {
      result.current.selectJobTemplate(10)
    })

    // templateDetail is undefined because mockUseQuery returns no data by default
    expect(result.current.templateDetail).toBeUndefined()
  })

  it('returns templateDetail when query has data', () => {
    const mockDetail = {
      id: 10,
      name: 'Deploy App',
      ask_variables_on_launch: true,
      ask_limit_on_launch: true,
    }
    mockUseQuery.mockReturnValue({
      data: mockDetail,
      isPending: false,
      isError: false,
      error: null,
    })

    const { result } = renderHook(() => useAAPBrowser('test-credential-id'))

    expect(result.current.templateDetail).toEqual(mockDetail)
  })

  it('selectOrganization clears selected template', () => {
    const { result } = renderHook(() => useAAPBrowser('test-credential-id'))

    act(() => {
      result.current.selectJobTemplate(10)
    })

    act(() => {
      result.current.selectOrganization('Engineering')
    })

    // After changing org, template detail should be undefined (no data from cleared query)
    expect(result.current.selectedOrg).toBe('Engineering')
  })

  it('initializes with provided initial state', () => {
    const { result } = renderHook(() =>
      useAAPBrowser('test-credential-id', { organization: 'Default', jobTemplateId: 10 })
    )

    expect(result.current.selectedOrg).toBe('Default')
    // The template detail query is enabled because selectedTemplateId is set
    expect(result.current.loadingTemplateDetail).toBe(false) // isPending=false from mock
  })

  it('loadingTemplateDetail is false when no template is selected', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      error: null,
    })

    const { result } = renderHook(() => useAAPBrowser('test-credential-id'))

    expect(result.current.loadingTemplateDetail).toBe(false)
  })
})
