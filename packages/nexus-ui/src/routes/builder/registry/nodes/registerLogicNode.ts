import { SplitIcon } from 'lucide-react'

import {
  createConditionActivity,
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
  loopType?: string
  items?: string
  count?: number
  maxIterations?: number
  joinStrategy?: string
  joinCount?: number
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
          const activityId = `logic_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

          let activity

          if (data.logicType === 'condition') {
            if (!data.condition) {
              onError('Condition expression is required')
              return
            }
            activity = createConditionActivity(activityId, data.name, data.condition)
          } else if (data.logicType === 'loop') {
            const loopType = data.loopType as 'forEach' | 'while' | 'count'

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
              maxIterations: data.maxIterations,
            })
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
