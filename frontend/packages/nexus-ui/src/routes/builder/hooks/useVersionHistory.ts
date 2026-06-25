import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'

import { workflowClient } from '../../../client'
import { useAlerts } from '../../../providers/alerts'
import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'

export type VersionStatus = 'draft' | 'published' | 'previously_published'

const VERSION_STATUSES: VersionStatus[] = ['draft', 'published', 'previously_published']
export function isVersionStatus(s: string): s is VersionStatus {
  return (VERSION_STATUSES as string[]).includes(s)
}

type WorkflowVersion = WorkflowAPI.components['schemas']['WorkflowVersionRead']

type UseVersionHistoryParams = {
  workflowId: string | null
  isNew: boolean
}

export function useVersionHistory({ workflowId, isNew }: UseVersionHistoryParams) {
  const [statusFilter, setStatusFilter] = useState<VersionStatus[]>([])
  const queryClient = useQueryClient()
  const { showSuccess, showError } = useAlerts()

  const versionsQuery = workflowClient.useQuery(
    'get',
    '/workflows/{workflow_id}/versions',
    {
      params: {
        path: { workflow_id: workflowId ?? '' },
      },
    },
    {
      enabled: !!workflowId && !isNew,
    }
  )

  const restoreMutation = workflowClient.useMutation('post', '/workflows/{workflow_id}/versions/{version}/restore')
  const publishMutation = workflowClient.useMutation('post', '/workflows/{workflow_id}/versions/{version}/publish')

  const allVersions = versionsQuery.data?.resources
  const filteredVersions = useMemo((): WorkflowVersion[] => {
    if (!allVersions) return []
    if (statusFilter.length === 0) return allVersions as WorkflowVersion[]
    return (allVersions as WorkflowVersion[]).filter((v) => statusFilter.includes(v.status as VersionStatus))
  }, [allVersions, statusFilter])

  const exportVersion = useCallback(
    (version: number, workflowName: string) => {
      const versionData = allVersions?.find((v) => v.version === version)
      if (!versionData?.workflow_definition) return

      const blob = new Blob([JSON.stringify(versionData.workflow_definition, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${workflowName}-v${version}.json`
      a.click()
      URL.revokeObjectURL(url)
    },
    [allVersions]
  )

  const publishVersion = useCallback(
    (version: number, publishName?: string, changeDescription?: string) => {
      if (!workflowId) return
      publishMutation.mutate(
        {
          params: { path: { workflow_id: workflowId, version } },
          body: { publish_name: publishName ?? null, change_description: changeDescription ?? null },
        },
        {
          onSuccess: () => {
            showSuccess({ title: 'Version published successfully' })
            detachPromise(versionsQuery.refetch())
            detachPromise(
              queryClient.invalidateQueries({
                predicate: (q) =>
                  q.queryKey[0] === 'get' &&
                  typeof q.queryKey[1] === 'string' &&
                  q.queryKey[1].startsWith('/workflows'),
              })
            )
          },
          onError: (error: unknown) => {
            showError({ title: 'Failed to publish version', description: getErrorMessage(error) })
          },
        }
      )
    },
    [workflowId, publishMutation, versionsQuery, queryClient, showSuccess, showError]
  )

  const openInNewWindow = useCallback(
    (version: number) => {
      if (!workflowId) return
      window.open(`/workflow-builder/${workflowId}?version=${version}`, '_blank', 'noopener,noreferrer')
    },
    [workflowId]
  )

  return {
    versionsQuery,
    filteredVersions,
    statusFilter,
    setStatusFilter,
    restoreMutation,
    exportVersion,
    openInNewWindow,
    publishVersion,
  }
}
