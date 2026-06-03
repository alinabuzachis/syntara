import type { Query } from '@tanstack/react-query'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { workflowClient } from '../../../client'
import { useAlerts } from '../../../providers/alerts'
import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'

function isWorkflowQuery(query: Query): boolean {
  return (
    query.queryKey[0] === 'get' && typeof query.queryKey[1] === 'string' && query.queryKey[1].startsWith('/workflows')
  )
}

export function usePublishWorkflow(workflowId: string | null, currentVersion: number | undefined) {
  const queryClient = useQueryClient()
  const { showSuccess, showError } = useAlerts()

  const { mutate: publishMutation, isPending: isPublishing } = workflowClient.useMutation(
    'post',
    '/workflows/{workflow_id}/versions/{version}/publish'
  )

  const publish = useCallback(
    (publishName?: string, description?: string, onSettled?: () => void) => {
      if (!workflowId || currentVersion == null) return

      publishMutation(
        {
          params: { path: { workflow_id: workflowId, version: currentVersion } },
          body: { publish_name: publishName ?? null, change_description: description ?? null },
        },
        {
          onSuccess: () => {
            showSuccess({ title: 'Workflow published successfully' })
            detachPromise(queryClient.invalidateQueries({ predicate: isWorkflowQuery }))
          },
          onError: (error: unknown) => {
            showError({ title: 'Failed to publish workflow', description: getErrorMessage(error) })
          },
          onSettled,
        }
      )
    },
    [workflowId, currentVersion, publishMutation, queryClient, showSuccess, showError]
  )

  return { publish, isPublishing }
}

export function useUnpublishWorkflow(workflowId: string | null) {
  const queryClient = useQueryClient()
  const { showSuccess, showError } = useAlerts()

  const { mutate: unpublishMutation, isPending: isUnpublishing } = workflowClient.useMutation(
    'post',
    '/workflows/{workflow_id}/unpublish'
  )

  const unpublish = useCallback(() => {
    if (!workflowId) return

    unpublishMutation(
      {
        params: { path: { workflow_id: workflowId } },
      },
      {
        onSuccess: () => {
          showSuccess({ title: 'Workflow unpublished successfully' })
          detachPromise(queryClient.invalidateQueries({ predicate: isWorkflowQuery }))
        },
        onError: (error: unknown) => {
          showError({ title: 'Failed to unpublish workflow', description: getErrorMessage(error) })
        },
      }
    )
  }, [workflowId, unpublishMutation, queryClient, showSuccess, showError])

  return { unpublish, isUnpublishing }
}
