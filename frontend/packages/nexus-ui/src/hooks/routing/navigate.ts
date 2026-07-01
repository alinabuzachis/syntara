import { tanstackRouter } from '../../app/tanstackRouter'
import { detachPromise } from '../../utils/detachPromise'

/**
 * Routing bridge: imperative `navigate(path, options?)` for use outside React components.
 *
 * Delegates to the module-scoped `tanstackRouter` instance so it can be called
 * from event handlers, async callbacks, and other non-component contexts.
 */
export function navigate(path: string, options?: { replace?: boolean }) {
  detachPromise(tanstackRouter.navigate({ to: path, replace: options?.replace }))
}
