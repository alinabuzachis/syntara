import { describe, expect, it } from 'vitest'

import {
  getGroupDetailPath,
  getPrincipalDetailPath,
  getProjectDetailPath,
  getServiceAccountDetailPath,
  getUserDetailPath,
} from './accessManagementPaths'
import { RolePrincipalType } from './RoleAssignmentTypes'

describe('accessManagementPaths', () => {
  describe('getUserDetailPath', () => {
    it('builds the user detail path', () => {
      expect(getUserDetailPath('u-123')).toBe('/system-administration/access-management/users/u-123')
    })
  })

  describe('getGroupDetailPath', () => {
    it('builds the group detail path', () => {
      expect(getGroupDetailPath('g-456')).toBe('/system-administration/access-management/groups/g-456')
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

  describe('getPrincipalDetailPath', () => {
    it('routes users to the user detail page', () => {
      expect(getPrincipalDetailPath(RolePrincipalType.USER, 'u-1')).toBe(
        '/system-administration/access-management/users/u-1'
      )
    })

    it('routes groups to the group detail page', () => {
      expect(getPrincipalDetailPath(RolePrincipalType.GROUP, 'g-1')).toBe(
        '/system-administration/access-management/groups/g-1'
      )
    })

    it('routes service accounts to the service account detail page', () => {
      expect(getPrincipalDetailPath(RolePrincipalType.SERVICE_ACCOUNT, 'sa-1')).toBe(
        '/system-administration/access-management/service-accounts/sa-1'
      )
    })
  })
})
