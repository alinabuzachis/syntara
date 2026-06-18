import { useNavigate as useTanStackNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { useLocation as useWouterLocation } from 'wouter'

import { isTanStackRouter } from '../../app/routerFlag'
import { detachPromise } from '../../utils/detachPromise'

function useNavigateWouter() {
  const [, navigate] = useWouterLocation()
  return navigate
}

function useNavigateTanStack() {
  const tsNavigate = useTanStackNavigate()
  return useCallback(
    (path: string, options?: { replace?: boolean }) => {
      detachPromise(tsNavigate({ to: path, replace: options?.replace }))
    },
    [tsNavigate]
  )
}

/**
 * Routing bridge: returns an imperative `navigate(path, options?)` function.
 *
 * Delegates to wouter or TanStack Router depending on the `nexus-ui-router`
 * localStorage flag. The implementation never changes at runtime — a page
 * reload is required to switch routers.
 */
export const useNavigate = isTanStackRouter() ? useNavigateTanStack : useNavigateWouter
