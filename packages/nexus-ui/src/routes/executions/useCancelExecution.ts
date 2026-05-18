import { useQueryClient } from '@tanstack/react-query'

import { executionsClient } from '../../client'
import { useAlerts } from '../../providers/alerts/AlertContext'
import { getErrorMessage } from '../../utils/apiErrors'
import { detachPromise } from '../../utils/detachPromise'

function invalidateExecutionQueries(queryClient: ReturnType<typeof useQueryClient>) {
  detachPromise(
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['get', '/executions/{execution_id}'] }),
      queryClient.invalidateQueries({ queryKey: ['get', '/executions/{execution_id}/activities'] }),
      queryClient.invalidateQueries({ queryKey: ['get', '/executions'] }),
    ])
  )
}

export function useCancelExecution(executionId: string) {
  const { showSuccess, showError } = useAlerts()
  const queryClient = useQueryClient()
  /* v8 ignore start -- v8 emits phantom branches from the compiled generic useMutation call */
  const cancelMutation = executionsClient.useMutation('post', '/executions/{execution_id}/cancel')
  /* v8 ignore stop */

  function handleCancel() {
    cancelMutation.mutate(
      { params: { path: { execution_id: executionId } } },
      {
        onSuccess() {
          showSuccess({ title: 'Execution cancellation requested' })
          invalidateExecutionQueries(queryClient)
        },
        onError(error: unknown) {
          showError({ title: 'Failed to cancel execution', description: getErrorMessage(error) })
        },
      }
    )
    /* v8 ignore start -- v8 phantom branches on handleCancel closing brace and return */
  }

  return { handleCancel, isPending: cancelMutation.isPending }
  /* v8 ignore stop */
}
