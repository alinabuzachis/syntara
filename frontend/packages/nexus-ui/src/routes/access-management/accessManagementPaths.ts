import { AppRoute } from '../../app/AppRoute'

/** Build the path to a user's detail page. */
export function getUserDetailPath(userId: string): string {
  return AppRoute.AccessManagement.UserDetail.replace(':userId', userId).replace('/:tab?', '')
}

/** Build the path to a service account's detail page. */
export function getServiceAccountDetailPath(serviceAccountId: string): string {
  return AppRoute.AccessManagement.ServiceAccountDetail.replace(':serviceAccountId', serviceAccountId)
}
