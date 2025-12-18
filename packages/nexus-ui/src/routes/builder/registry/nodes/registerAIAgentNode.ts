import { BrainIcon } from '@patternfly/react-icons'

import { AIAgentNodeForm } from '../../node-forms/AIAgentNodeForm'
import { createBasicNode } from '../helpers/nodeTemplates'
import { NodeRegistry } from '../NodeRegistry'

/**
 * Register the AI Agent node type
 */
export default function registerAIAgentNode() {
  NodeRegistry.register(
    createBasicNode({
      id: 'agent',
      label: 'AI Agent',
      icon: BrainIcon,
      category: 'action',
      description: 'Execute tasks using AI agents',
      keywords: ['ai', 'agent', 'llm', 'gpt', 'intelligent', 'autonomous'],
      order: 20,
      formComponent: AIAgentNodeForm,
    })
  )
}
