import { RhUiRobotIcon } from '@patternfly/react-icons'

import { createAgenticActivity, useWorkflowStore } from '../../../../stores/useWorkflowStore'
import { AIAgentNodeForm } from '../../node-forms/AIAgentNodeForm'
import type { AIAgentFormData } from '../../node-forms/AIAgentNodeForm'
import { parseToolsString } from '../../utils/agentHelpers'
import { NodeRegistry } from '../NodeRegistry'

/**
 * Register the AI Agent node type.
 * Creates activities with agentic executor type for AI-powered task execution
 * via MCP (Model Context Protocol) servers.
 */
export default function registerAIAgentNode() {
  NodeRegistry.register<AIAgentFormData>({
    id: 'agent',
    label: 'AI Agent',
    icon: RhUiRobotIcon,
    category: 'action',
    description: 'Execute tasks using AI agents',
    keywords: ['ai', 'agent', 'llm', 'gpt', 'intelligent', 'autonomous', 'mcp', 'claude', 'gemini'],
    order: 20,
    formComponent: AIAgentNodeForm,
    onSubmit: (data, onSuccess, onError) => {
      try {
        // Generate unique activity ID
        const activityId = `activity_${crypto.randomUUID().replace(/-/g, '_')}`

        // Parse comma-separated tools into array
        const toolsArray = parseToolsString(data.tools)

        // Create agentic activity
        const activity = createAgenticActivity(
          activityId,
          data.name,
          toolsArray,
          data.prompt || undefined,
          data.model || undefined
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
