import { AppRoute } from '../../app/AppRoute'

/** Build the path to a user's detail page. */
export function getUserDetailPath(userId: string): string {
  return AppRoute.AccessManagement.UserDetail.replace(':userId', userId).replace('/:tab?', '')
}
