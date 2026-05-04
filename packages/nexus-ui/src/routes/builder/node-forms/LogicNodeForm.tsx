import { ActivityTypeEnum } from '@ansible/nexus-contracts'
import type { ReactNode } from 'react'

import { ConditionNodeForm, type ConditionFormData } from './ConditionNodeForm'
import { ConvergeNodeForm, type ConvergeFormData } from './ConvergeNodeForm'
import { LoopNodeForm, type LoopFormData } from './LoopNodeForm'

/** Converge strategy: when to continue after branches (re-exported from ConvergeNodeForm) */
export type { ConvergeStrategy, RemainingBehavior } from './ConvergeNodeForm'

/**
 * Combined form data type for logic nodes.
 * This is a union of all specialized form types plus the logicType discriminator.
 */
export type LogicFormData = {
  name: string
  logicType: string
  // Condition fields
  condition?: string
  // Loop fields
  type?: string
  items?: string
  maxIterations?: number
  maxIterationsBehavior?: 'continue' | 'fail'
  indexVariable?: string
  itemVariable?: string
  // Converge fields
  timeout?: number
  timeoutEnabled?: boolean
  timeoutSeconds?: number
  timeoutMinutes?: number
  timeoutHours?: number
  timeoutDays?: number
  onTimeout?: 'continue' | 'fail'
  strategy?: 'all' | 'any'
  requiredPathCount?: number
  remainingBehavior?: 'continue' | 'cancel'
}

type LogicNodeFormProps = Readonly<{
  onSubmit: (data: LogicFormData) => void
  initialData?: Partial<LogicFormData>
  onHeaderContentChange?: (content: ReactNode | null) => void
}>

/**
 * LogicNodeForm - A thin wrapper that delegates to specialized forms based on logicType.
 *
 * This form is used by registerLogicNode to present a unified "Logic" node with subtypes.
 * It delegates to the appropriate specialized form:
 * - ConditionNodeForm for conditional logic
 * - LoopNodeForm for loop logic
 * - ConvergeNodeForm for converge logic
 *
 * Note: This wrapper exists to maintain the subtype pattern in registerLogicNode.
 * For editing existing nodes, use the specialized forms directly via NodeDetails components.
 */
// eslint-disable-next-line complexity
export function LogicNodeForm({ onSubmit, initialData, onHeaderContentChange }: LogicNodeFormProps) {
  const logicType = initialData?.logicType

  // Handle Condition node
  if (logicType === ActivityTypeEnum.CONDITION) {
    const conditionData: Partial<ConditionFormData> = {
      name: initialData?.name,
      condition: initialData?.condition,
    }

    const handleConditionSubmit = (data: ConditionFormData) => {
      onSubmit({
        ...data,
        logicType: ActivityTypeEnum.CONDITION,
      })
    }

    return (
      <ConditionNodeForm
        onSubmit={handleConditionSubmit}
        initialData={conditionData}
        onHeaderContentChange={onHeaderContentChange}
      />
    )
  }

  // Handle Loop node
  if (logicType === ActivityTypeEnum.LOOP) {
    const loopData: Partial<LoopFormData> = {
      name: initialData?.name,
      type: (initialData?.type as 'forEach' | 'while') || 'while',
      items: initialData?.items,
      condition: initialData?.condition,
      maxIterations: initialData?.maxIterations,
      indexVariable: initialData?.indexVariable,
      itemVariable: initialData?.itemVariable,
    }

    const handleLoopSubmit = (data: LoopFormData) => {
      onSubmit({
        ...data,
        logicType: ActivityTypeEnum.LOOP,
      })
    }

    return (
      <LoopNodeForm onSubmit={handleLoopSubmit} initialData={loopData} onHeaderContentChange={onHeaderContentChange} />
    )
  }

  // Handle Converge node
  if (logicType === ActivityTypeEnum.CONVERGE) {
    const convergeData: Partial<ConvergeFormData> = {
      name: initialData?.name,
      strategy: initialData?.strategy,
      timeoutEnabled: initialData?.timeoutEnabled,
      timeoutSeconds: initialData?.timeoutSeconds,
      timeoutMinutes: initialData?.timeoutMinutes,
      timeoutHours: initialData?.timeoutHours,
      timeoutDays: initialData?.timeoutDays,
      timeout: initialData?.timeout,
      onTimeout: initialData?.onTimeout,
      requiredPathCount: initialData?.requiredPathCount,
      remainingBehavior: initialData?.remainingBehavior,
    }

    const handleConvergeSubmit = (data: ConvergeFormData) => {
      onSubmit({
        ...data,
        logicType: ActivityTypeEnum.CONVERGE,
      })
    }

    return (
      <ConvergeNodeForm
        onSubmit={handleConvergeSubmit}
        initialData={convergeData}
        onHeaderContentChange={onHeaderContentChange}
      />
    )
  }

  // Fallback for unknown logic type
  return null
}
