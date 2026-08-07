import { AppRoute } from '../../app/AppRoute'

import { RolePrincipalType } from './RoleAssignmentTypes'

/** Build the path to a user's detail page. */
export function getUserDetailPath(userId: string): string {
  return AppRoute.AccessManagement.UserDetail.replace(':userId', userId).replace('/:tab?', '')
}

/** Build the path to a group's detail page. */
export function getGroupDetailPath(groupId: string): string {
  return AppRoute.AccessManagement.GroupDetail.replace(':groupId', groupId)
}

/** Build the path to a project's detail page. */
export function getProjectDetailPath(projectId: string): string {
  return AppRoute.AccessManagement.ProjectDetail.replace(':projectId', projectId)
}

/** Build the path to a service account's detail page. */
export function getServiceAccountDetailPath(serviceAccountId: string): string {
  return AppRoute.AccessManagement.ServiceAccountDetail.replace(':serviceAccountId', serviceAccountId)
}

/** Build the detail path for a user, group, or service account principal. */
export function getPrincipalDetailPath(principalType: RolePrincipalType, id: string): string {
  switch (principalType) {
    case RolePrincipalType.GROUP:
      return getGroupDetailPath(id)
    case RolePrincipalType.SERVICE_ACCOUNT:
      return getServiceAccountDetailPath(id)
    case RolePrincipalType.USER:
      return getUserDetailPath(id)
  }
}
