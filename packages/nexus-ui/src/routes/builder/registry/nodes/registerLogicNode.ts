import { SplitIcon } from 'lucide-react'
import { NodeRegistry } from '../NodeRegistry'
import { LogicNodeForm } from '../../node-forms/LogicNodeForm'

/**
 * Register the Logic node type
 */
export function registerLogicNode() {
  NodeRegistry.register({
    id: 'logic',
    label: 'Logic',
    icon: SplitIcon,
    category: 'logic',
    description: 'Add conditional logic and branching to workflows',
    keywords: ['if', 'else', 'condition', 'branch', 'switch', 'case', 'decision'],
    order: 50,
    formComponent: LogicNodeForm,
    onSubmit: (data, onSuccess, onError) => {
      try {
        // Logic node submission will be implemented
        // when the form provides proper data structure
        onSuccess()
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Failed to add Logic node')
      }
    },
  })
}
