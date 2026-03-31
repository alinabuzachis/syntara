import { ExecutorTypeEnum, type TaskActivity } from '@ansible/nexus-contracts'

/**
 * Resolved executor strings produced by {@link detectTaskNodeType} (not API contract values).
 * Use these instead of string literals when comparing `actualExecutor` / `detectedExecutorType`.
 */
export const DetectedExecutorType = {
  /** AAP via connector workaround (ansible connector id), distinct from {@link ExecutorTypeEnum.AAP_JOB_TEMPLATE} */
  AAP: 'aap',
} as const

// Extended types for internal metadata and non-standard executors
export type TaskActivityWithMetadata = TaskActivity & {
  metadata?: {
    __executorType?: string
  }
  condition?: string
}

interface ConnectorPromptData {
  __type?: string
  connectorId?: string
  operation?: string
  parameters?: Record<string, unknown>
}

export type DetectedNodeTypeResult = {
  detectedExecutorType: string | undefined
  connectorData: {
    connectorId?: string
    operation?: string
    parameters?: Record<string, unknown>
  } | null
  actualExecutor: string
}

/**
 * Detects the actual node type from a TaskActivity.
 * This handles various workarounds where the backend stores nodes in non-standard formats:
 * - AAP/Connector nodes stored as agentic executors
 * - Override executor types in metadata
 */
export function detectTaskNodeType(data: TaskActivity): DetectedNodeTypeResult {
  // Check if this is an AAP/connector node disguised as agentic (workaround for backend)
  const dataWithMetadata = data as TaskActivityWithMetadata
  const overrideExecutorType = dataWithMetadata.metadata?.__executorType

  // Parse connector data if it's the workaround format (agentic executor with connector data in prompt)
  let connectorData: { connectorId?: string; operation?: string; parameters?: Record<string, unknown> } | null = null
  let detectedExecutorType: string | undefined = overrideExecutorType

  // If executor is agentic, check the prompt to detect connector/AAP nodes
  // This handles both cases: when metadata exists and when it's missing after save/load
  if (data.task.executor === ExecutorTypeEnum.AGENTIC) {
    try {
      const raw: unknown = JSON.parse(data.task.config.prompt ?? '{}')
      const parsed = raw as ConnectorPromptData
      if (parsed.__type === 'connector') {
        connectorData = {
          connectorId: parsed.connectorId,
          operation: parsed.operation,
          parameters: parsed.parameters,
        }
        // If metadata is missing, detect AAP nodes from connectorId
        // Check if this is an AAP connector (ansible-automation-platform)
        if (
          !detectedExecutorType &&
          (parsed.connectorId === 'ansible-automation-platform' || parsed.connectorId?.includes('ansible'))
        ) {
          detectedExecutorType = DetectedExecutorType.AAP
        }
      }
    } catch {
      // Fallthrough
    }
  }

  const actualExecutor = detectedExecutorType || data.task.executor

  return {
    detectedExecutorType,
    connectorData,
    actualExecutor,
  }
}
