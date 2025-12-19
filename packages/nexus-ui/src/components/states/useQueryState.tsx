import { EmptyStateServiceUnavailable } from '@ansible/nexus-ui-framework'

import { useApiErrorAlert } from '../../hooks/useApiErrorAlert'
import { getErrorMessage, isServiceUnavailableError } from '../../utils/apiErrors'

import { ErrorState } from './ErrorState'
import { LoadingState } from './LoadingState'

/**
 * Hook to handle query state rendering for loading, error, and 503 states.
 *
 * Automatically detects 503 Service Unavailable errors and renders
 * the appropriate component with the error message from the API.
 *
 * @param state - Query state object with error and isPending properties
 * @param title - Optional title for error states
 * @returns JSX element for the current state, or null if data is ready
 *
 * @example
 * const query = workflowClient.useQuery('get', '/workflows')
 * const queryState = useQueryState(query, 'Error loading workflows')
 *
 * if (queryState) return queryState // Renders loading, error, or 503 state
 *
 * // Render successful data...
 * return <WorkflowList data={query.data} />
 */
export function useQueryState(state: { error: unknown; isPending: boolean }, title?: string) {
  const { error, isPending } = state

  // Show an alert for query errors (deduped). Suppress 503 here since we render a 503-specific EmptyState.
  useApiErrorAlert(error, { title, suppress503: true })

  if (error) {
    // Check for 503 Service Unavailable errors
    if (isServiceUnavailableError(error)) {
      return <EmptyStateServiceUnavailable description={getErrorMessage(error)} />
    }

    // Regular errors
    return <ErrorState title={title} message={error} />
  }

  if (isPending) {
    return <LoadingState />
  }

  return null
}
