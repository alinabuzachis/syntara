import { RhUiRobotIcon } from '@patternfly/react-icons'

import { RegistryNodeId } from '../../../../constants'
import { createAgenticActivity, useWorkflowStore } from '../../../../stores/useWorkflowStore'
import { AIAgentNodeForm } from '../../node-forms/AIAgentNodeForm'
import type { AIAgentFormSubmitData } from '../../node-forms/AIAgentNodeForm'
import { parseToolsString } from '../../utils/agentHelpers'
import { buildNamedActivity } from '../../utils/nodeCreationHelpers'
import { getDefaultNodeBaseName } from '../../utils/nodeNaming'
import { NodeRegistry } from '../NodeRegistry'

/**
 * Register the AI Agent node type.
 * Creates activities with agentic executor type for AI-powered task execution
 * via MCP (Model Context Protocol) servers.
 */
export default function registerAIAgentNode() {
  NodeRegistry.register<AIAgentFormSubmitData>({
    id: RegistryNodeId.AGENT,
    label: 'AI Agent',
    icon: RhUiRobotIcon,
    category: 'action',
    description: 'Execute tasks using AI agents',
    keywords: ['ai', 'agent', 'llm', 'gpt', 'intelligent', 'autonomous', 'mcp', 'claude', 'gemini'],
    order: 20,
    formComponent: AIAgentNodeForm,
    onSubmit: (data, onSuccess, onError) => {
      try {
        // Parse comma-separated tools into array
        const toolsArray = parseToolsString(data.tools)
        const baseName = getDefaultNodeBaseName({ nodeTypeId: RegistryNodeId.AGENT, label: 'AI Agent' })
        const { activityId, activity } = buildNamedActivity(baseName, data.name, (id, name) =>
          createAgenticActivity({
            id,
            name,
            tools: toolsArray,
            prompt: data.prompt || undefined,
            model: data.model || undefined,
            fileIds: data.fileIds.length > 0 ? data.fileIds : undefined,
          })
        )

        if (activity) {
          useWorkflowStore.getState().addActivity(activity)
          onSuccess(activityId) // Return the new node ID
        } else {
          onError('Invalid agent configuration. Please check your inputs.')
        }
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Failed to add AI agent')
      }
    },
  })
}
