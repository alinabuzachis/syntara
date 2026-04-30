import type { Activity } from '@ansible/nexus-contracts'
import type { ReactNode } from 'react'

import { useAlerts } from '../../../components/alerts'
import { createAgenticActivity, useWorkflowStoreActions } from '../../../stores/useWorkflowStore'
import { AIAgentNodeForm } from '../node-forms/AIAgentNodeForm'
import type { AIAgentFormInitialData, AIAgentFormSubmitData } from '../node-forms/AIAgentNodeForm'
import { parseToolsString } from '../utils/agentHelpers'

type AIAgentNodeDetailsProps = {
  taskData: Activity
  nodeId: string
  onClose: () => void
  onHeaderContentChange?: (content: ReactNode | null) => void
  projectId?: string
}

/**
 * Side panel for editing an AI agent **step** (agentic executor on the canvas).
 * Handles MCP server, tools, model, prompt, and files.
 */
export function AIAgentNodeDetails({
  taskData,
  nodeId,
  onClose,
  onHeaderContentChange,
  projectId,
}: Readonly<AIAgentNodeDetailsProps>) {
  const { showError } = useAlerts()
  // Use action accessor - component won't re-render when store state changes
  const { updateActivity } = useWorkflowStoreActions()

  // In v2, config is at activity.config directly (not task.config)
  const agentConfig = (taskData.config ?? {}) as {
    tool_selections?: string[]
    tools?: string[]
    prompt?: string
    model?: string
    file_ids?: string[]
    fileIds?: string[]
    credential_id?: string
    response_schema?: Record<string, unknown>
    responseSchema?: Record<string, unknown>
  }

  const envModel: string | undefined = import.meta.env.VITE_NEXUS_OPENROUTER_MODEL as string | undefined
  const defaultModel = envModel || 'anthropic/claude-3.5-sonnet'

  const tools = agentConfig.tool_selections ?? agentConfig.tools ?? []
  const responseSchema = agentConfig.response_schema ?? agentConfig.responseSchema

  const initialData: AIAgentFormInitialData = {
    name: taskData.name,
    model: agentConfig.model ?? defaultModel,
    prompt: agentConfig.prompt ?? '',
    tools: tools.join(', '),
    credential_id: agentConfig.credential_id ?? undefined,
    responseSchema: responseSchema ? JSON.stringify(responseSchema, null, 2) : undefined,
  }

  const handleSubmit = (data: AIAgentFormSubmitData) => {
    try {
      // Parse comma-separated tools into array
      const toolsArray = parseToolsString(data.tools)

      // Merge existing file IDs with newly uploaded ones (Set removes any duplicates)
      const existingFileIds = agentConfig.file_ids ?? agentConfig.fileIds ?? []
      const allFileIds = [...new Set([...existingFileIds, ...data.fileIds])]

      // Create updated agentic activity with merged file IDs and response schema
      const updatedActivity = createAgenticActivity({
        id: nodeId,
        name: data.name,
        tools: toolsArray,
        prompt: data.prompt ?? undefined,
        model: data.model ?? undefined,
        fileIds: allFileIds.length > 0 ? allFileIds : undefined,
        credentialId: data.credential_id ?? undefined,
        responseSchema: data.parsedResponseSchema,
      })

      updateActivity(nodeId, updatedActivity)
      onClose()
    } catch (error) {
      showError('Update failed', error instanceof Error ? error.message : 'Failed to update AI agent step')
    }
  }

  return (
    <AIAgentNodeForm
      initialData={initialData}
      submitButtonText="Update step"
      onSubmit={handleSubmit}
      onHeaderContentChange={onHeaderContentChange}
      projectId={projectId}
    />
  )
}
