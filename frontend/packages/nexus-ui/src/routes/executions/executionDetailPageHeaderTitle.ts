import type { ExecutionsAPI } from '@ansible/nexus-contracts'

type Execution = ExecutionsAPI.components['schemas']['ExecutionRead']

type WorkflowDefinitionLike = {
  metadata?: { name?: string; description?: string }
}

export function executionDetailPageHeading(execution: Execution | undefined, executionId: string): string {
  const meta = (execution?.workflow_definition as unknown as WorkflowDefinitionLike | undefined)?.metadata
  return meta?.name ?? `Execution ${executionId.slice(0, 8)}...`
}

export function executionDetailHasTitleRowExtras(execution: Execution | undefined): boolean {
  return Boolean(execution?.status || execution?.created_at)
}
