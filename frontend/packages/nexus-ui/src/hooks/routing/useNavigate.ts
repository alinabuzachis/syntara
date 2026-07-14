import { useNavigate as useTanStackNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'

import { detachPromise } from '../../utils/detachPromise'

/**
 * @deprecated Use `useNavigate` from `@tanstack/react-router` directly.
 */
export function useNavigate() {
  const tsNavigate = useTanStackNavigate()
  return useCallback(
    (path: string, options?: { replace?: boolean }) => {
      detachPromise(tsNavigate({ to: path, replace: options?.replace }))
    },
    [tsNavigate]
  )
}
