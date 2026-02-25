import { ActivityTypeEnum, EdgeHandleEnum } from '@ansible/nexus-contracts'
import {
  RhUiBranchFillIcon,
  RhUiConditionNodeIcon,
  RhUiLoopNodeIcon,
  RhUiMergeNodesIcon,
} from '@patternfly/react-icons'

import {
  createConditionActivity,
  createConvergeActivity,
  createGenericActivity,
  createLoopActivity,
  useWorkflowStore,
} from '../../../../stores/useWorkflowStore'
import { LogicNodeForm, type LogicFormData } from '../../node-forms/LogicNodeForm'
import { getDefaultNodeBaseName, getNodeDisplayName } from '../../utils/nodeNaming'
import { createCustomNode } from '../helpers/nodeTemplates'
import { NodeRegistry } from '../NodeRegistry'

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
        icon: RhUiBranchFillIcon,
        category: 'logic',
        description: 'Add conditional logic and branching to workflows',
        keywords: ['if', 'else', 'condition', 'branch', 'switch', 'case', 'decision', 'converge', 'join'],
        order: 50,
        selectionTitle: 'Select a logic node',
        formComponent: LogicNodeForm,
        subtypes: [
          {
            id: 'logic-condition',
            label: 'Conditional',
            icon: RhUiConditionNodeIcon,
            description: 'Set parameters to branch the automation.',
            formTitle: 'Configure Conditional Logic',
            initialData: { logicType: ActivityTypeEnum.CONDITION },
          },
          {
            id: 'logic-converge',
            label: 'Converge',
            icon: RhUiMergeNodesIcon,
            description: 'Converge automation to single path.',
            formTitle: 'Configure Converge Logic',
            initialData: { logicType: ActivityTypeEnum.CONVERGE },
          },
          {
            id: 'logic-loop',
            label: 'Loop',
            icon: RhUiLoopNodeIcon,
            description: 'Batch automation to repeat specific actions.',
            formTitle: 'Configure Loop Logic',
            initialData: { logicType: ActivityTypeEnum.LOOP },
          },
        ],
      },
      (data, onSuccess, onError) => {
        try {
          const activityId = `logic_${Date.now()}_${generateSecureRandomId()}`

          let activity

          const name = getNodeDisplayName(
            getDefaultNodeBaseName({
              nodeTypeId: 'logic',
              initialData: { logicType: data.logicType },
              label:
                data.logicType === ActivityTypeEnum.CONDITION
                  ? 'Conditional'
                  : data.logicType === ActivityTypeEnum.LOOP
                    ? 'Loop'
                    : 'Converge',
            }),
            data.name
          )

          if (data.logicType === ActivityTypeEnum.CONDITION) {
            if (!data.condition) {
              onError('Conditional expression is required')
              return
            }
            activity = createConditionActivity(activityId, name, data.condition)
          } else if (data.logicType === ActivityTypeEnum.LOOP) {
            const loopType = data.type as 'forEach' | 'while'

            if (loopType === 'forEach' && !data.items) {
              onError('Items expression is required for forEach loop')
              return
            }
            if (loopType === 'while' && !data.condition) {
              onError('Conditional expression is required for while loop')
              return
            }

            activity = createLoopActivity(activityId, name, loopType, {
              items: data.items,
              condition: data.condition,
              maxIterations: data.maxIterations,
              indexVariable: data.indexVariable,
              itemVariable: data.itemVariable,
            })

            // Create a generic placeholder node for the loop body with custom message
            const genericNodeId = `task_${Date.now()}_${generateSecureRandomId()}`
            const genericName = getNodeDisplayName('Generic Node')
            const genericActivity = createGenericActivity(
              genericNodeId,
              genericName,
              'Replace this node to complete the loop' // Custom message
            )

            // ATOMIC UPDATE: Add both activities and edges in a single transaction
            // This prevents race conditions from multiple store updates triggering initialNodes recomputation
            const currentEdges = useWorkflowStore.getState().edges
            useWorkflowStore.getState().batchAddActivitiesAndEdges({
              activities: [activity, genericActivity],
              edges: [
                ...currentEdges,
                {
                  id: `${activityId}-loop-${genericNodeId}`,
                  source: activityId,
                  target: genericNodeId,
                  sourceHandle: EdgeHandleEnum.LOOP,
                  targetHandle: EdgeHandleEnum.TARGET,
                },
                {
                  id: `${genericNodeId}-${activityId}-end`,
                  source: genericNodeId,
                  target: activityId,
                  sourceHandle: EdgeHandleEnum.SOURCE,
                  targetHandle: EdgeHandleEnum.END,
                },
              ],
            })

            // Signal success with the loop node ID (not the generic node)
            onSuccess(activityId)
            return
          } else if (data.logicType === 'converge') {
            if (!data.strategy) {
              onError('Continue when criteria is required')
              return
            }
            if (data.strategy === 'any') {
              if (data.requiredPathCount === undefined || data.requiredPathCount < 1) {
                onError('Required path count must be at least 1 when using "Any branches reach this node"')
                return
              }
              if (!data.remainingBehavior) {
                onError('Behavior of remaining nodes is required when using "Any branches reach this node"')
                return
              }
            }
            activity = createConvergeActivity(activityId, name, {
              strategy: data.strategy,
              timeout: data.timeout,
              onTimeout: data.onTimeout,
              ...(data.strategy === 'any' && {
                requiredPathCount: data.requiredPathCount,
                remainingBehavior: data.remainingBehavior,
              }),
            })
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
