import type { ReactNode } from 'react'

import { useCanI } from '../hooks/useCanI'

type PermissionGateProps = {
  /** The action to check, e.g. `"create"`, `"delete"`. */
  action: string
  /** The resource type, e.g. `"workflow"`, `"credential"`. */
  resourceType: string
  /** Optional resource instance id for scoped checks. */
  resourceId?: string
  /** Content shown when the permission is granted. */
  children: ReactNode
  /** Content shown when the permission is denied. Defaults to rendering nothing. */
  fallback?: ReactNode
}

/**
 * Declaratively gates content behind a permission check.
 *
 * While the check is in flight, neither children nor fallback are rendered
 * (safe-false default). Once resolved, renders children if allowed, or
 * fallback if denied.
 *
 * @example
 * ```tsx
 * <PermissionGate action="create" resourceType="workflow">
 *   <Button onClick={handleCreate}>Create workflow</Button>
 * </PermissionGate>
 * ```
 */
export function PermissionGate({
  action,
  resourceType,
  resourceId,
  children,
  fallback = null,
}: Readonly<PermissionGateProps>) {
  const { allowed, isChecking } = useCanI(action, resourceType, { resourceId })

  if (isChecking) return null
  if (!allowed) return fallback
  return children
}
