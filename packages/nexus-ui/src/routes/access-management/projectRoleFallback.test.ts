import { beforeEach, describe, expect, it, vi } from 'vitest'

import { accessFetchClient } from '../access/accessClient'

import { fetchProjectRolesForPrincipal } from './projectRoleFallback'

vi.mock('../access/accessClient', () => ({
  accessFetchClient: {
    GET: vi.fn(),
  },
}))

function getProjectId(options: unknown): string | undefined {
  if (!options || typeof options !== 'object' || !('params' in options)) return undefined
  const params = options.params
  if (!params || typeof params !== 'object' || !('path' in params)) return undefined
  const path = params.path
  if (!path || typeof path !== 'object' || !('project_id' in path)) return undefined
  return typeof path.project_id === 'string' ? path.project_id : undefined
}

describe('fetchProjectRolesForPrincipal', () => {
  const originalReportError = globalThis.reportError

  beforeEach(() => {
    vi.clearAllMocks()
    if (originalReportError) {
      globalThis.reportError = originalReportError
    } else {
      Reflect.deleteProperty(globalThis, 'reportError')
    }
  })

  it('returns an empty list when no projects are available', async () => {
    vi.mocked(accessFetchClient.GET).mockResolvedValueOnce({
      data: [],
      error: null,
    } as never)

    await expect(fetchProjectRolesForPrincipal('user', 'user-1')).resolves.toEqual([])
    expect(accessFetchClient.GET).toHaveBeenCalledWith('/projects')
  })

  it('returns matching user assignments and skips 403/404 project fetch errors', async () => {
    vi.mocked(accessFetchClient.GET).mockImplementation((path, options) => {
      if (path === '/projects') {
        return Promise.resolve({
          data: [
            { id: 'project-1', name: 'Alpha' },
            { id: 'project-2', name: 'Beta' },
            { id: 'project-3', name: 'Gamma' },
          ],
          error: null,
        }) as never
      }

      if (path === '/projects/{project_id}/roles' && getProjectId(options) === 'project-1') {
        return Promise.resolve({
          data: [
            {
              id: 'assignment-1',
              user_id: 'user-1',
              role_name: 'project-admin',
              created_at: '2026-01-15T10:00:00Z',
            },
            {
              id: 'assignment-2',
              user_id: 'user-2',
              role_name: 'project-user',
              created_at: '2026-01-16T10:00:00Z',
            },
          ],
          error: null,
        }) as never
      }

      if (path === '/projects/{project_id}/roles' && getProjectId(options) === 'project-2') {
        return Promise.resolve({
          data: undefined,
          error: { status: 403, detail: 'Forbidden' },
        }) as never
      }

      if (path === '/projects/{project_id}/roles' && getProjectId(options) === 'project-3') {
        return Promise.resolve({
          data: undefined,
          error: { response: { status: 404 }, detail: 'Not found' },
        }) as never
      }

      return Promise.resolve({ data: undefined, error: null }) as never
    })

    await expect(fetchProjectRolesForPrincipal('user', 'user-1')).resolves.toEqual([
      {
        id: 'assignment-1',
        roleName: 'project-admin',
        scope: 'Alpha',
        scopeType: 'project',
        createdAt: '2026-01-15T10:00:00Z',
        projectId: 'project-1',
      },
    ])
  })

  it('reports unexpected Error objects from group role fetches', async () => {
    const reportError = vi.fn()
    globalThis.reportError = reportError as typeof globalThis.reportError

    vi.mocked(accessFetchClient.GET).mockImplementation((path, options) => {
      if (path === '/projects') {
        return Promise.resolve({
          data: [{ id: 'project-1', name: 'Alpha' }],
          error: null,
        }) as never
      }

      if (path === '/projects/{project_id}/group-roles' && getProjectId(options) === 'project-1') {
        return Promise.resolve({
          data: undefined,
          error: new Error('boom'),
        }) as never
      }

      return Promise.resolve({ data: undefined, error: null }) as never
    })

    await expect(fetchProjectRolesForPrincipal('group', 'group-1')).resolves.toEqual([])
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }))
  })

  it('normalizes unexpected non-Error failures before reporting them', async () => {
    const reportError = vi.fn()
    globalThis.reportError = reportError as typeof globalThis.reportError

    vi.mocked(accessFetchClient.GET).mockImplementation((path, options) => {
      if (path === '/projects') {
        return Promise.resolve({
          data: [{ id: 'project-9', name: 'Delta' }],
          error: null,
        }) as never
      }

      if (path === '/projects/{project_id}/roles' && getProjectId(options) === 'project-9') {
        return Promise.resolve({
          data: undefined,
          error: { status: 500, detail: 'Internal error' },
        }) as never
      }

      return Promise.resolve({ data: undefined, error: null }) as never
    })

    await expect(fetchProjectRolesForPrincipal('user', 'user-9')).resolves.toEqual([])

    expect(reportError).toHaveBeenCalledOnce()
    expect(reportError.mock.calls[0][0]).toBeInstanceOf(Error)
    expect((reportError.mock.calls[0][0] as Error).message).toContain('project-9')
  })
})
