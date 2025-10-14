import { ErrorState } from './ErrorState'
import { LoadingState } from './LoadingState'

export function useQueryState(state: { error: unknown; isPending: boolean }, title?: string) {
  const { error, isPending } = state
  if (error) {
    return <ErrorState title={title} message={error} />
  }

  if (isPending) {
    return <LoadingState />
  }

  return null
}
