import { useState, useMemo } from 'react'

import { useWorkflowsQuery } from '../../workflows/useWorkflowsQuery'

export type ChildWorkflowOption = {
  value: string // workflow ID
  label: string // workflow name + version
  description?: string
}

export type UseChildWorkflowSelectorProps = {
  projectId: string | null
  selectedWorkflowId: string | null
  onChange: (workflowId: string | null) => void
}

/**
 * Hook for managing child workflow selection in Sub-workflow step configuration.
 *
 * Fetches workflows from the current project (V1: same-project only) and provides
 * options formatted for display in a dropdown selector.
 *
 * @param projectId - Current project ID (null if no project selected)
 * @param selectedWorkflowId - Currently selected workflow ID
 * @param onChange - Callback when workflow selection changes
 * @returns Workflow options, selection state, and loading/error states
 */
export function useChildWorkflowSelector({ projectId, selectedWorkflowId, onChange }: UseChildWorkflowSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('')

  const { workflowsQuery, workflows } = useWorkflowsQuery({
    queryParams: {
      name: searchTerm,
      status: 'published', // Only published workflows (ANSTRAT-2347 AC: Reference mode)
    },
    isAllProjects: false, // V1: Same-project only
    stableProjectId: projectId ?? undefined,
    projectSelectorReady: !!projectId,
  })

  const options = useMemo<ChildWorkflowOption[]>(() => {
    return workflows.map((wf) => ({
      value: wf.id ?? '',
      label: `${wf.name} (v${wf.current_version})`,
      description: wf.description ?? undefined,
    }))
  }, [workflows])

  const selectedOption = options.find((o) => o.value === selectedWorkflowId)

  return {
    options,
    selectedOption,
    selectedWorkflowId,
    onSelectionChange: onChange,
    searchTerm,
    setSearchTerm,
    isLoading: workflowsQuery.isLoading,
    hasError: workflowsQuery.isError,
  }
}
