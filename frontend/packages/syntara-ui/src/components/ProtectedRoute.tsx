import type { ReactNode } from 'react'

import type { PermissionRequirement } from '../hooks/permissionUtils'
import { useCanI } from '../hooks/useCanI'

import { EmptyStateAccessDenied } from './EmptyStateAccessDenied'
import { NxErrorState } from './states/NxErrorState'
import { NxLoadingState } from './states/NxLoadingState'

type ProtectedRouteProps = PermissionRequirement & {
  children: ReactNode
}

/**
 * Route-level permission guard.
 *
 * Wraps a route's element to block direct-URL access when the user lacks the
 * required permission. Shows a loading spinner while the check is in flight,
 * an error state when the permission check fails (network/server error),
 * and an access-denied empty state when the check resolves to denied.
 */
export function ProtectedRoute({ action, resourceType, children }: Readonly<ProtectedRouteProps>) {
  const { allowed, isChecking, isError } = useCanI(action, resourceType)

  if (isChecking) return <NxLoadingState />
  if (isError) {
    return (
      <NxErrorState title="Unable to verify permissions" message="The permission check failed. Please try again." />
    )
  }
  if (!allowed) {
    return (
      <EmptyStateAccessDenied
        description={`You do not have permission to access this page (requires ${resourceType}:${action}).`}
      />
    )
  }
  return children
}
