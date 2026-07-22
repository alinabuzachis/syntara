import { useEffect } from 'react'
import type { Dispatch } from 'react'

import type { WorkflowDefinition } from '../../../stores/workflowStoreTypes'
import type { BuilderAction } from '../builderReducer'
import { useWorkflowVerification } from '../useWorkflowVerification'

type UseBuilderValidationParams = {
  dispatch: Dispatch<BuilderAction>
  hasValidationIssues: boolean | undefined
  isNew: boolean
  isDirty: boolean
  currentWorkflow: WorkflowDefinition | null
}

export function useBuilderValidation({
  dispatch,
  hasValidationIssues,
  isNew,
  isDirty,
  currentWorkflow,
}: UseBuilderValidationParams) {
  const { handleVerifySilent } = useWorkflowVerification({ dispatch })

  useEffect(() => {
    if (hasValidationIssues && !isNew && !isDirty && currentWorkflow) handleVerifySilent()
  }, [hasValidationIssues, isNew, isDirty, currentWorkflow, handleVerifySilent])

  return { handleVerifySilent }
}
