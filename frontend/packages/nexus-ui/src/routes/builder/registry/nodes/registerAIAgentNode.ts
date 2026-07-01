import { RhUiRobotIcon } from '@patternfly/react-icons'

import { RegistryNodeId } from '../../../../constants'
import { createAgenticActivity, useWorkflowStore } from '../../../../stores/useWorkflowStore'
import { AIAgentNodeForm } from '../../node-forms/AIAgentNodeForm'
import type { AIAgentFormSubmitData } from '../../node-forms/AIAgentNodeForm'
import { buildNamedActivity } from '../../utils/nodeCreationHelpers'
import { getDefaultNodeBaseName } from '../../utils/nodeNaming'
import { NodeRegistry } from '../NodeRegistry'

/**
 * Register the Task Agent step type.
 * Creates activities with agentic executor type for AI-powered task execution
 * via MCP (Model Context Protocol) servers.
 */
export default function registerAIAgentNode() {
  NodeRegistry.register<AIAgentFormSubmitData>({
    id: RegistryNodeId.AGENT,
    label: 'Task Agent',
    icon: RhUiRobotIcon,
    category: 'action',
    description: 'Execute tasks using task agents',
    keywords: ['ai', 'agent', 'llm', 'gpt', 'intelligent', 'autonomous', 'mcp', 'claude', 'gemini'],
    order: 20,
    formComponent: AIAgentNodeForm,
    onSubmit: (data, onSuccess, onError) => {
      try {
        const baseName = getDefaultNodeBaseName({ nodeTypeId: RegistryNodeId.AGENT, label: 'Task Agent' })
        const { activityId, activity } = buildNamedActivity(baseName, data.name, (id, name) =>
          createAgenticActivity({
            id,
            name,
            toolSelectionStrategy: data.tool_selection_strategy,
            toolSelections: data.tool_selections,
            integrationConnections:
              data.integration_connections && data.integration_connections.length > 0
                ? data.integration_connections
                : undefined,
            prompt: data.prompt || undefined,
            model: data.model || undefined,
            fileIds: data.fileIds.length > 0 ? data.fileIds : undefined,
            credentialId: data.credential_id ?? undefined,
            responseSchema: data.parsedResponseSchema,
            settings: data.settings,
          })
        )

        if (activity) {
          useWorkflowStore.getState().addActivity(activity)
          onSuccess(activityId)
        } else {
          onError('Invalid agent configuration. Please check your inputs.')
        }
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Failed to add task agent')
      }
    },
  })
}
