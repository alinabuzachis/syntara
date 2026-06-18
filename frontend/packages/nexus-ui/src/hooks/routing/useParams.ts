import { useParams as useTanStackParams } from '@tanstack/react-router'
import { useParams as useWouterParams } from 'wouter'

import { isTanStackRouter } from '../../app/routerFlag'

type DefaultParams = Record<string, string | undefined>

function useParamsWouter<T extends DefaultParams = DefaultParams>() {
  // wouter returns DefaultParams | T; assert to T since a matched route guarantees typed params
  return useWouterParams<T>() as T
}

function useParamsTanStack<T extends DefaultParams = DefaultParams>() {
  // strict: false returns params from any matched route without needing
  // a compile-time route type reference — compatible with the bridge signature.
  return useTanStackParams({ strict: false }) as T
}

/**
 * Routing bridge: returns typed route parameters from the closest matching route.
 *
 * Delegates to wouter or TanStack Router depending on the `nexus-ui-router`
 * localStorage flag. The implementation never changes at runtime — a page
 * reload is required to switch routers.
 */
export const useParams: <T extends DefaultParams = DefaultParams>() => T = isTanStackRouter()
  ? useParamsTanStack
  : useParamsWouter
