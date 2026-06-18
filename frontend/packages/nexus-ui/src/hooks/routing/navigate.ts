import { navigate as wouterNavigate } from 'wouter/use-browser-location'

import { isTanStackRouter } from '../../app/routerFlag'
import { tanstackRouter } from '../../app/tanstackRouter'
import { detachPromise } from '../../utils/detachPromise'

function navigateWouter(...args: Parameters<typeof wouterNavigate>) {
  return wouterNavigate(...args)
}

function navigateTanStack(path: string, options?: { replace?: boolean }) {
  detachPromise(tanstackRouter.navigate({ to: path, replace: options?.replace }))
}

/**
 * Routing bridge: imperative `navigate(path, options?)` for use outside React components.
 *
 * Delegates to wouter or TanStack Router depending on the `nexus-ui-router`
 * localStorage flag. The implementation never changes at runtime — a page
 * reload is required to switch routers.
 */
export const navigate = isTanStackRouter() ? navigateTanStack : navigateWouter
