import { describe, expect, it } from 'vitest'

import { projectIdParam } from './queryParams'

describe('projectIdParam', () => {
  it('returns project_id when projectId is provided', () => {
    expect(projectIdParam('proj-123')).toEqual({ project_id: 'proj-123' })
  })

  it('returns empty object when projectId is undefined', () => {
    expect(projectIdParam(undefined)).toEqual({})
  })

  it('returns empty object when projectId is empty string', () => {
    expect(projectIdParam('')).toEqual({})
  })

  it('spreads correctly into query params', () => {
    const query = { integration_type: 'mcp_server', enabled: true, ...projectIdParam('proj-456') }
    expect(query).toEqual({ integration_type: 'mcp_server', enabled: true, project_id: 'proj-456' })
  })

  it('spreads without adding project_id when omitted', () => {
    const query = { integration_type: 'mcp_server', enabled: true, ...projectIdParam(undefined) }
    expect(query).toEqual({ integration_type: 'mcp_server', enabled: true })
    expect(query).not.toHaveProperty('project_id')
  })
})
