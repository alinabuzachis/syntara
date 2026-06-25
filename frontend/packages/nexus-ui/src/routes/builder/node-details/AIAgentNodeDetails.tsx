import type { Activity } from '@ansible/nexus-contracts'
import type { ReactNode } from 'react'

import { useAlerts } from '../../../providers/alerts'
import { createAgenticActivity, useWorkflowStoreActions } from '../../../stores/useWorkflowStore'
import { AIAgentNodeForm } from '../node-forms/AIAgentNodeForm'
import type { AIAgentFormInitialData, AIAgentFormSubmitData } from '../node-forms/AIAgentNodeForm'

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

  type AgentConfig = {
    tool_selection_strategy?: 'ALL' | 'NONE' | 'SELECTED'
    tool_selections?: string[]
    tools?: string[]
    integration_connections?: { integration_id: string; credential_id: string }[]
    prompt?: string
    model?: string
    file_ids?: string[]
    fileIds?: string[]
    credential_id?: string
    response_schema?: Record<string, unknown>
    responseSchema?: Record<string, unknown>
  }
  // In v2, parameters are at activity.parameters directly (not task.parameters).
  // Some data shapes use a top-level config field for MCP tool config.
  const taskDataExt = taskData as typeof taskData & { config?: AgentConfig }
  const agentConfig = (taskDataExt.config ?? taskData.parameters ?? {}) as AgentConfig

  const envModel: string | undefined = import.meta.env.VITE_NEXUS_OPENROUTER_MODEL as string | undefined
  const defaultModel = envModel || 'anthropic/claude-3.5-sonnet'

  const toolSelections = agentConfig.tool_selections ?? agentConfig.tools ?? []
  const toolSelectionStrategy = agentConfig.tool_selection_strategy ?? 'NONE'
  const integrationConnections = agentConfig.integration_connections ?? []
  const responseSchema = agentConfig.response_schema ?? agentConfig.responseSchema

  const initialData: AIAgentFormInitialData = {
    name: taskData.name,
    model: agentConfig.model ?? defaultModel,
    prompt: agentConfig.prompt ?? '',
    tool_selection_strategy: toolSelectionStrategy,
    tool_selections: toolSelections,
    integration_connections: integrationConnections,
    credential_id: agentConfig.credential_id ?? '',
    responseSchema: responseSchema ? JSON.stringify(responseSchema, null, 2) : undefined,
    settings: taskData.settings,
  }

  const handleSubmit = (data: AIAgentFormSubmitData) => {
    try {
      // Merge existing file IDs with newly uploaded ones (Set removes any duplicates)
      const existingFileIds = agentConfig.file_ids ?? agentConfig.fileIds ?? []
      const allFileIds = [...new Set([...existingFileIds, ...data.fileIds])]

      // Create updated agentic activity with merged file IDs and response schema
      const updatedActivity = createAgenticActivity({
        id: nodeId,
        name: data.name,
        toolSelectionStrategy: data.tool_selection_strategy,
        toolSelections: data.tool_selections,
        integrationConnections: data.integration_connections.length > 0 ? data.integration_connections : undefined,
        prompt: data.prompt ?? undefined,
        model: data.model ?? undefined,
        fileIds: allFileIds.length > 0 ? allFileIds : undefined,
        credentialId: data.credential_id ?? undefined,
        responseSchema: data.parsedResponseSchema,
      })

      updateActivity(nodeId, updatedActivity)
      onClose()
    } catch (error) {
      showError({
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Failed to update AI agent step',
      })
    }
  }

  return (
    <AIAgentNodeForm
      initialData={initialData}
      onSubmit={handleSubmit}
      onHeaderContentChange={onHeaderContentChange}
      projectId={projectId}
    />
  )
}
