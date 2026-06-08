import { useMemo } from 'react'

import { approvalsClient } from '../../client'
import { accessClient } from '../access/accessClient'
import type { ProjectRead } from '../access/types'

import type { ApprovalWithDetails } from './Approvals'

const getApprovalDetails = (approval: ApprovalWithDetails) => {
  const wfCtx = approval.workflow_context as { workflow_name?: string; workflow_version_id?: string } | undefined
  return {
    approvalName: approval.name || approval.id,
    workflowName: wfCtx?.workflow_name || 'Unknown',
    workflowId: wfCtx?.workflow_version_id,
  }
}

type SortColumn = 'approvalName' | 'workflowName' | 'requested_at' | 'decided_at' | 'status'

const getSortValue = (approval: ApprovalWithDetails, sortColumn: SortColumn) => {
  switch (sortColumn) {
    case 'approvalName':
      return approval.approvalName || approval.id
    case 'workflowName':
      return approval.workflowName ?? ''
    case 'requested_at':
      return approval.created_at ? new Date(approval.created_at).getTime() : 0
    case 'decided_at': {
      const decidedAt = approval.decided_at
      return decidedAt ? new Date(decidedAt).getTime() : undefined
    }
    case 'status':
      return approval.status ?? ''
  }
}

type UseApprovalsDataParams = {
  projectSelectorReady: boolean
  isAllProjects: boolean
  stableProjectId: string | null | undefined
  queryParams: Record<string, unknown>
  projects: ProjectRead[]
  sortColumn: SortColumn
  sortDirection: 'asc' | 'desc'
}

export function useApprovalsData({
  projectSelectorReady,
  isAllProjects,
  stableProjectId,
  queryParams,
  projects,
  sortColumn,
  sortDirection,
}: UseApprovalsDataParams) {
  const allApprovalsQuery = approvalsClient.useQuery(
    'get',
    '/approvals',
    {
      params: { query: queryParams },
    },
    {
      enabled: projectSelectorReady && isAllProjects,
    }
  )

  const projectApprovalsQuery = accessClient.useQuery(
    'get',
    '/projects/{project_id}/approvals',
    {
      params: {
        path: { project_id: stableProjectId ?? '' },
        query: queryParams,
      },
    },
    {
      enabled: !!stableProjectId && !isAllProjects,
    }
  )

  const approvalsQuery = isAllProjects ? allApprovalsQuery : projectApprovalsQuery
  const approvalsData = approvalsQuery.data

  const enrichedApprovals = useMemo(() => {
    const approvals = (approvalsData?.resources ?? []) as ApprovalWithDetails[]
    return approvals.map((approval) => {
      const { approvalName, workflowName, workflowId } = getApprovalDetails(approval)
      return {
        ...approval,
        approvalName,
        workflowName,
        workflowId,
      }
    })
  }, [approvalsData?.resources])

  // Group approvals by project when viewing all projects
  const groupedApprovals = useMemo(() => {
    if (!isAllProjects) return null
    const groups = new Map<string, { project: (typeof projects)[number] | null; approvals: ApprovalWithDetails[] }>()
    for (const approval of enrichedApprovals) {
      const projectId = (approval as unknown as { project_id?: string }).project_id ?? 'unknown'
      if (!groups.has(projectId)) {
        groups.set(projectId, {
          project: projects.find((p) => p.id === projectId) ?? null,
          approvals: [],
        })
      }
      groups.get(projectId)!.approvals.push(approval)
    }
    return groups
  }, [enrichedApprovals, projects, isAllProjects])

  // Client-side sorting of current page only
  const sortedApprovals = useMemo(() => {
    const sorted = [...enrichedApprovals]
    sorted.sort((a, b) => {
      const aValue = getSortValue(a, sortColumn)
      const bValue = getSortValue(b, sortColumn)

      if (aValue === undefined && bValue === undefined) return 0
      if (aValue === undefined) return 1
      if (bValue === undefined) return -1

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const comparison = aValue.localeCompare(bValue)
        return sortDirection === 'asc' ? comparison : -comparison
      }

      const comparison = (aValue as number) - (bValue as number)
      return sortDirection === 'asc' ? comparison : -comparison
    })
    return sorted
  }, [enrichedApprovals, sortColumn, sortDirection])

  return {
    approvalsQuery,
    enrichedApprovals,
    groupedApprovals,
    sortedApprovals,
  }
}
