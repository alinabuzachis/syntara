import { SplitIcon } from 'lucide-react'

import { LogicNodeForm } from '../../node-forms/LogicNodeForm'
import { createBasicNode } from '../helpers/nodeTemplates'
import { NodeRegistry } from '../NodeRegistry'

/**
 * Register the Logic node type
 */
export default function registerLogicNode() {
  NodeRegistry.register(
    createBasicNode({
      id: 'logic',
      label: 'Logic',
      icon: SplitIcon,
      category: 'logic',
      description: 'Add conditional logic and branching to workflows',
      keywords: ['if', 'else', 'condition', 'branch', 'switch', 'case', 'decision'],
      order: 50,
      formComponent: LogicNodeForm,
    })
  )
}
