import type { TaskActivity } from '@ansible/nexus-contracts'

import { useAlerts } from '../../../components/alerts'
import { createAgenticActivity, useWorkflowStoreActions } from '../../../stores/useWorkflowStore'
import { AIAgentNodeForm } from '../node-forms/AIAgentNodeForm'
import type { AIAgentFormData } from '../node-forms/AIAgentNodeForm'
import { parseToolsString } from '../utils/agentHelpers'

interface AIAgentNodeDetailsProps {
  taskData: TaskActivity & { task: { executor: 'agentic'; config: unknown } }
  nodeId: string
  onClose: () => void
}

/**
 * Node details component for AI Agent nodes (agentic executor).
 * Handles viewing and editing AI agent configuration including MCP server, tools, model, and prompt.
 */
export function AIAgentNodeDetails({ taskData, nodeId, onClose }: AIAgentNodeDetailsProps) {
  const { showError } = useAlerts()
  // Use action accessor - component won't re-render when store state changes
  const { updateActivity } = useWorkflowStoreActions()

  const agentConfig = taskData.task.config as {
    tools?: string[]
    prompt?: string
    model?: string
  }

  // Get model from environment variable or use default
  const defaultModel = import.meta.env.VITE_NEXUS_OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet'

  const initialData: Partial<AIAgentFormData> = {
    name: taskData.name,
    model: agentConfig.model || defaultModel,
    prompt: agentConfig.prompt || '',
    tools: agentConfig.tools?.join(', ') || '',
  }

  const handleSubmit = (data: AIAgentFormData) => {
    try {
      // Parse comma-separated tools into array
      const toolsArray = parseToolsString(data.tools)

      // Create updated agentic activity
      const updatedActivity = createAgenticActivity(
        nodeId,
        data.name,
        toolsArray,
        data.prompt || undefined,
        data.model || undefined,
        taskData.task.inputs ? JSON.stringify(taskData.task.inputs) : undefined
      )

      updateActivity(nodeId, updatedActivity)
      onClose()
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to update AI agent node', 'Update Failed')
    }
  }

  return (
    <AIAgentNodeForm
      initialData={initialData}
      submitButtonText="Update node"
      onSubmit={handleSubmit}
      onCancel={onClose}
    />
  )
}
