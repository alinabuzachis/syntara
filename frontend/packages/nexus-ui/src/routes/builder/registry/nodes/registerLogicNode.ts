import { ActivityTypeEnum } from '@ansible/nexus-contracts'
import {
  RhUiBranchFillIcon,
  RhUiConditionNodeIcon,
  RhUiClockIcon,
  RhUiLoopNodeIcon,
  RhUiMergeNodesIcon,
  RhUiTreeViewIcon,
} from '@patternfly/react-icons'

import { RegistryNodeId } from '../../../../constants'
import { LogicNodeForm, type LogicFormData } from '../../node-forms/LogicNodeForm'
import { createCustomNode } from '../helpers/nodeTemplates'
import { NodeRegistry } from '../NodeRegistry'

import {
  buildLogicStepName,
  generateSecureRandomId,
  submitConditionLogic,
  submitConvergeLogic,
  submitLoopLogic,
  submitSwitchLogic,
  submitWaitLogic,
} from './registerLogicNodeSubmit'

function dispatchLogicSubmit({
  data,
  activityId,
  name,
  onSuccess,
  onError,
}: {
  data: LogicFormData
  activityId: string
  name: string
  onSuccess: (id: string) => void
  onError: (msg: string) => void
}) {
  if (data.logicType === ActivityTypeEnum.CONDITION) {
    if (submitConditionLogic(activityId, name, data, onError)) onSuccess(activityId)
    return
  }
  if (data.logicType === ActivityTypeEnum.LOOP) {
    submitLoopLogic({ activityId, name, data, generateId: generateSecureRandomId, onSuccess, onError })
    return
  }
  if (data.logicType === ActivityTypeEnum.CONVERGE) {
    if (submitConvergeLogic(activityId, name, data, onError)) onSuccess(activityId)
    return
  }
  if (data.logicType === ActivityTypeEnum.SWITCH) {
    if (submitSwitchLogic(activityId, name, data, onError)) onSuccess(activityId)
    return
  }
  if (data.logicType === ActivityTypeEnum.WAIT) {
    if (submitWaitLogic(activityId, name, data)) onSuccess(activityId)
    return
  }
  onError('Invalid logic type')
}

/**
 * Register the Logic step type (conditional, loop, converge subtypes).
 */
export default function registerLogicNode() {
  NodeRegistry.register(
    createCustomNode<LogicFormData>(
      {
        id: RegistryNodeId.LOGIC,
        label: 'Logic',
        icon: RhUiBranchFillIcon,
        category: 'logic',
        description: 'Add conditional logic and branching to workflows',
        keywords: [
          'if',
          'else',
          'condition',
          'branch',
          'switch',
          'case',
          'decision',
          'converge',
          'join',
          'wait',
          'delay',
          'pause',
          'timer',
        ],
        order: 50,
        selectionTitle: 'Select a logic step',
        formComponent: LogicNodeForm,
        subtypes: [
          {
            id: RegistryNodeId.LOGIC_CONDITION,
            label: 'Conditional',
            icon: RhUiConditionNodeIcon,
            description: 'Set parameters to branch the workflow.',
            formTitle: 'Configure Conditional Logic',
            initialData: { logicType: ActivityTypeEnum.CONDITION },
          },
          {
            id: RegistryNodeId.LOGIC_CONVERGE,
            label: 'Converge',
            icon: RhUiMergeNodesIcon,
            description: 'Converge workflow to single path.',
            formTitle: 'Configure Converge Logic',
            initialData: { logicType: ActivityTypeEnum.CONVERGE },
          },
          {
            id: RegistryNodeId.LOGIC_LOOP,
            label: 'Loop',
            icon: RhUiLoopNodeIcon,
            description: 'Batch workflow to repeat specific actions.',
            formTitle: 'Configure Loop Logic',
            initialData: { logicType: ActivityTypeEnum.LOOP },
          },
          {
            id: RegistryNodeId.LOGIC_SWITCH,
            label: 'Switch',
            icon: RhUiTreeViewIcon,
            description: 'Set multiple parameters to branch the workflow.',
            formTitle: 'Configure Switch Logic',
            initialData: { logicType: ActivityTypeEnum.SWITCH },
          },
          {
            id: RegistryNodeId.LOGIC_WAIT,
            label: 'Wait',
            icon: RhUiClockIcon,
            description: 'Pause workflow execution for a specified duration.',
            formTitle: 'Configure Wait Duration',
            initialData: { logicType: ActivityTypeEnum.WAIT },
          },
        ],
      },
      (data, onSuccess, onError) => {
        try {
          const activityId = `logic_${Date.now()}_${generateSecureRandomId()}`
          const name = buildLogicStepName(data)

          dispatchLogicSubmit({ data, activityId, name, onSuccess, onError })
        } catch (error) {
          onError(error instanceof Error ? error.message : 'Failed to add logic step')
        }
      }
    )
  )
}
