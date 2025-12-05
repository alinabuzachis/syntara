import { SplitIcon } from 'lucide-react'

import {
  createConditionActivity,
  createGenericActivity,
  createJoinActivity,
  createLoopActivity,
  useWorkflowStore,
} from '../../../../stores/useWorkflowStore'
import { LogicNodeForm } from '../../node-forms/LogicNodeForm'
import { createCustomNode } from '../helpers/nodeTemplates'
import { NodeRegistry } from '../NodeRegistry'

type LogicFormData = {
  name: string
  logicType: string
  condition?: string
  type?: string
  items?: string
  count?: number
  indexVariable?: string
  itemVariable?: string
  joinStrategy?: string
  joinCount?: number
}

/**
 * Generate a cryptographically secure random ID suffix
 */
function generateSecureRandomId(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const crypto = window.crypto || (window as any).msCrypto
  const array = new Uint32Array(2)
  crypto.getRandomValues(array)
  return array[0].toString(36) + array[1].toString(36)
}

/**
 * Register the Logic node type
 */
export default function registerLogicNode() {
  NodeRegistry.register(
    createCustomNode<LogicFormData>(
      {
        id: 'logic',
        label: 'Logic',
        icon: SplitIcon,
        category: 'logic',
        description: 'Add conditional logic and branching to workflows',
        keywords: ['if', 'else', 'condition', 'branch', 'switch', 'case', 'decision', 'converge', 'join'],
        order: 50,
        formComponent: LogicNodeForm,
      },
      (data, onSuccess, onError) => {
        try {
          const activityId = `logic_${Date.now()}_${generateSecureRandomId()}`

          let activity

          if (data.logicType === 'condition') {
            if (!data.condition) {
              onError('Condition expression is required')
              return
            }
            activity = createConditionActivity(activityId, data.name, data.condition)
          } else if (data.logicType === 'loop') {
            const loopType = data.type as 'forEach' | 'while' | 'count'

            if (loopType === 'forEach' && !data.items) {
              onError('Items expression is required for forEach loop')
              return
            }
            if (loopType === 'while' && !data.condition) {
              onError('Condition expression is required for while loop')
              return
            }
            if (loopType === 'count' && data.count === undefined) {
              onError('Count is required for count loop')
              return
            }

            activity = createLoopActivity(activityId, data.name, loopType, {
              items: data.items,
              condition: data.condition,
              count: data.count,
              indexVariable: data.indexVariable,
              itemVariable: data.itemVariable,
            })

            // Add the loop activity first
            useWorkflowStore.getState().addActivity(activity)

            // Create a generic placeholder node for the loop body with custom message
            const genericNodeId = `task_${Date.now()}_${generateSecureRandomId()}`
            const genericActivity = createGenericActivity(
              genericNodeId,
              '', // No name
              'Replace this node to complete the loop' // Custom message
            )
            useWorkflowStore.getState().addActivity(genericActivity)

            // Create edges: loop -> generic task -> loop (back)
            const currentEdges = useWorkflowStore.getState().edges
            useWorkflowStore.getState().setEdges([
              ...currentEdges,
              {
                id: `${activityId}-loop-${genericNodeId}`,
                source: activityId,
                target: genericNodeId,
                sourceHandle: 'loop',
                targetHandle: 'target',
              },
              {
                id: `${genericNodeId}-${activityId}-end`,
                source: genericNodeId,
                target: activityId,
                sourceHandle: 'source',
                targetHandle: 'end',
              },
            ])

            // Signal success with the loop node ID (not the generic node)
            onSuccess(activityId)
            return
          } else if (data.logicType === 'converge') {
            const strategy = (data.joinStrategy || 'all') as 'all' | 'any' | 'majority' | 'count'

            if (strategy === 'count' && data.joinCount === undefined) {
              onError('Branch count is required for count strategy')
              return
            }

            activity = createJoinActivity(activityId, data.name, strategy, data.joinCount)
          } else {
            onError('Invalid logic type')
            return
          }

          useWorkflowStore.getState().addActivity(activity)
          onSuccess(activityId)
        } catch (error) {
          onError(error instanceof Error ? error.message : 'Failed to add logic node')
        }
      }
    )
  )
}
