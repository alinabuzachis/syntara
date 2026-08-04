import { tanstackRouter } from '../../app/tanstackRouter'
import { detachPromise } from '../../utils/detachPromise'

/**
 * @deprecated Use `tanstackRouter.navigate()` directly instead.
 */
export function navigate(path: string, options?: { replace?: boolean }) {
  detachPromise(tanstackRouter.navigate({ to: path, replace: options?.replace }))
}
