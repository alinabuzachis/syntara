import { useNavigate as useTanStackNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'

import { detachPromise } from '../../utils/detachPromise'

/**
 * Routing bridge: returns an imperative `navigate(path, options?)` function.
 *
 * Thin wrapper over TanStack Router's `useNavigate` that preserves the
 * wouter-compatible `(path, options?)` call signature used by all consumers.
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
