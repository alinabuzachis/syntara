import { BrainIcon } from 'lucide-react'

import { AIAgentNodeForm } from '../../node-forms/AIAgentNodeForm'
import { NodeRegistry } from '../NodeRegistry'

/**
 * Register the AI Agent node type
 */
export function registerAIAgentNode() {
  NodeRegistry.register({
    id: 'agent',
    label: 'AI Agent',
    icon: BrainIcon,
    category: 'action',
    description: 'Execute tasks using AI agents',
    keywords: ['ai', 'agent', 'llm', 'gpt', 'intelligent', 'autonomous'],
    order: 20,
    formComponent: AIAgentNodeForm,
    onSubmit: (data, onSuccess, onError) => {
      try {
        // AI Agent submission logic will be implemented
        // when the form provides proper data structure
        onSuccess()
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Failed to add AI Agent')
      }
    },
  })
}
