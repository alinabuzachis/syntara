import { describe, expect, it } from 'vitest'

import { getProjectDetailPath, getServiceAccountDetailPath, getUserDetailPath } from './accessManagementPaths'

describe('accessManagementPaths', () => {
  describe('getUserDetailPath', () => {
    it('builds the user detail path', () => {
      expect(getUserDetailPath('u-123')).toBe('/system-administration/access-management/users/u-123')
    })
  })

  describe('getProjectDetailPath', () => {
    it('builds the project detail path', () => {
      expect(getProjectDetailPath('proj-456')).toBe('/system-administration/access-management/projects/proj-456')
    })
  })

  describe('getServiceAccountDetailPath', () => {
    it('builds the service account detail path', () => {
      expect(getServiceAccountDetailPath('sa-789')).toBe(
        '/system-administration/access-management/service-accounts/sa-789'
      )
    })
  })
})
