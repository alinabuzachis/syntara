import type { WorkflowAPI } from '@ansible/nexus-contracts'

import type { ExecutionCopyData } from '../hooks/useExecutionCopyToEditor'

export type BuilderContentProps = Readonly<{
  workflow?: WorkflowAPI.components['schemas']['WorkflowWithVersion']
  isNew: boolean
  workflowId: string | null
  executionCopy?: ExecutionCopyData
  initialViewVersion?: number | null
}>
