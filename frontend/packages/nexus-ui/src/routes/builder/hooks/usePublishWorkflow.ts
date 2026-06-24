import type { Query } from '@tanstack/react-query'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { workflowClient } from '../../../client'
import { useAlerts } from '../../../providers/alerts'
import { useWorkflowStore } from '../../../stores/useWorkflowStore'
import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'
import { buildWorkflowDefinition } from '../utils/workflowDefinitionBuilder'

function isWorkflowQuery(query: Query): boolean {
  return (
    query.queryKey[0] === 'get' && typeof query.queryKey[1] === 'string' && query.queryKey[1].startsWith('/workflows')
  )
}

export function usePublishWorkflow(
  workflowId: string | null,
  currentVersion: number | undefined,
  workflowName?: string,
  workflowDescription?: string
) {
  const queryClient = useQueryClient()
  const { showSuccess, showError } = useAlerts()

  const { mutate: publishMutation, isPending: isPublishing } = workflowClient.useMutation(
    'post',
    '/workflows/{workflow_id}/versions/{version}/publish'
  )

  const publish = useCallback(
    (publishName?: string, description?: string, onSettled?: () => void) => {
      if (!workflowId || currentVersion == null) return

      let workflowDefinition: Record<string, unknown> | undefined
      const { currentWorkflow, isDirty, edges, nodePositions, _positionsUserModified } = useWorkflowStore.getState()
      const wf = currentWorkflow?.workflow as { name?: string; description?: string } | undefined
      if (isDirty && currentWorkflow) {
        workflowDefinition = buildWorkflowDefinition(
          workflowName || String(wf?.name ?? ''),
          workflowDescription || String(wf?.description ?? ''),
          currentWorkflow.workflow.activities ?? [],
          currentWorkflow.triggers ?? [],
          { edges, nodePositions: _positionsUserModified ? nodePositions : {} }
        ) as unknown as Record<string, unknown>
      }

      publishMutation(
        {
          params: { path: { workflow_id: workflowId, version: currentVersion } },
          body: {
            publish_name: publishName ?? null,
            change_description: description ?? null,
            ...(workflowDefinition ? { workflow_definition: workflowDefinition } : {}),
          } as { publish_name: string | null; change_description: string | null },
        },
        {
          onSuccess: () => {
            showSuccess({ title: 'Workflow published successfully' })
            if (workflowDefinition) useWorkflowStore.getState().markClean()
            detachPromise(queryClient.invalidateQueries({ predicate: isWorkflowQuery }))
          },
          onError: (error: unknown) => {
            showError({ title: 'Failed to publish workflow', description: getErrorMessage(error) })
          },
          onSettled,
        }
      )
    },
    [
      workflowId,
      currentVersion,
      workflowName,
      workflowDescription,
      publishMutation,
      queryClient,
      showSuccess,
      showError,
    ]
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
