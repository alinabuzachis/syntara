import type { WorkflowAPI } from '@syntara/contracts'

import type { ExecutionCopyData } from '../hooks/useExecutionCopyToEditor'

export type BuilderContentProps = Readonly<{
  workflow?: WorkflowAPI.components['schemas']['WorkflowReadWithVersion']
  isNew: boolean
  workflowId: string | null
  executionCopy?: ExecutionCopyData
  initialViewVersion?: number | null
}>
