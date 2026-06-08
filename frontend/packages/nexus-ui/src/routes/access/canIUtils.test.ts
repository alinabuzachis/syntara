import { describe, expect, it } from 'vitest'

import { RESOURCE_ENDPOINTS } from './canIUtils'

describe('RESOURCE_ENDPOINTS', () => {
  it('contains expected resource types', () => {
    expect(Object.keys(RESOURCE_ENDPOINTS)).toEqual(
      expect.arrayContaining(['workflow', 'project', 'execution', 'policy', 'role', 'user'])
    )
  })

  it('each endpoint has path, idField, and labelField', () => {
    for (const [, endpoint] of Object.entries(RESOURCE_ENDPOINTS)) {
      expect(endpoint).toHaveProperty('path')
      expect(endpoint).toHaveProperty('idField')
      expect(endpoint).toHaveProperty('labelField')
    }
  })
})
