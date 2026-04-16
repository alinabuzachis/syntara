import { describe, expect, it } from 'vitest'

/**
 * Runtime import so `types.ts` is executed under coverage (many consumers use `import type` only,
 * which can omit the module from the instrumented graph).
 */
import type { PermissionRow } from './types'
import './types'

describe('access/types', () => {
  it('supports PermissionRow objects used by assignment tables', () => {
    const row: PermissionRow = {
      id: 'p1',
      principalType: 'group',
      principalId: 'g1',
      principalName: 'Admins',
      assignmentType: 'role',
      assignmentName: 'Editor',
      roleId: 'r1',
      scopeType: 'system',
      scopeName: 'System',
      sourceEndpoint: 'group-role-assignments',
    }
    expect(row.sourceEndpoint).toBe('group-role-assignments')
  })
})
