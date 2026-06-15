import type { ExecutionsAPI } from '@ansible/nexus-contracts'
import { useMemo } from 'react'

type Execution = ExecutionsAPI.components['schemas']['ExecutionRead']
type ActivityData = ExecutionsAPI.components['schemas']['ActivityData']
type ActivityExecution = ExecutionsAPI.components['schemas']['ActivityExecution']

type WorkflowDefinitionLike = {
  name?: string
  description?: string
  metadata?: { name?: string; description?: string }
  nodes?: Array<{ id: string; name?: string }>
  workflow?: { activities?: Array<{ id: string; name?: string }> }
}

export function useExecutionWorkflow(execution: Execution | undefined) {
  const workflow = useMemo(() => {
    if (!execution?.workflow_definition || !execution.workflow_id) return undefined
    const wfDef = execution.workflow_definition as unknown as WorkflowDefinitionLike
    return {
      id: execution.workflow_id,
      name: wfDef.metadata?.name ?? wfDef.name ?? 'Workflow',
      description: wfDef.metadata?.description ?? wfDef.description,
      version: { workflow_definition: execution.workflow_definition },
    }
  }, [execution])

  const activities = useMemo((): (ActivityData | ActivityExecution)[] => execution?.activities ?? [], [execution])

  const activityNameMap = useMemo(() => {
    const wfDef = execution?.workflow_definition as unknown as Record<string, unknown> | undefined
    const map = new Map<string, string>()
    const nodes = (wfDef?.nodes ??
      (wfDef?.workflow as Record<string, unknown> | undefined)?.activities ??
      []) as Array<{ id: string; name?: string }>
    for (const node of nodes) {
      if (node.name) map.set(node.id, node.name)
    }
    return map
  }, [execution?.workflow_definition])

  return { workflow, activities, activityNameMap }
}
