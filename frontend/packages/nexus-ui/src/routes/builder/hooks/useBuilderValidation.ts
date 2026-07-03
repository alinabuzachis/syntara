import { useCallback, useEffect } from 'react'
import type { Dispatch } from 'react'

import { useWorkflowStore } from '../../../stores/useWorkflowStore'
import type { WorkflowDefinition } from '../../../stores/workflowStoreTypes'
import type { BuilderAction } from '../builderReducer'
import { extractValidationErrors, useWorkflowVerification } from '../useWorkflowVerification'

type UseBuilderValidationParams = {
  dispatch: Dispatch<BuilderAction>
  hasValidationIssues: boolean | undefined
  isNew: boolean
  currentWorkflow: WorkflowDefinition | null
}

export function useBuilderValidation({
  dispatch,
  hasValidationIssues,
  isNew,
  currentWorkflow,
}: UseBuilderValidationParams) {
  const { handleVerifySilent } = useWorkflowVerification({ dispatch })

  useEffect(() => {
    if (hasValidationIssues && !isNew && currentWorkflow) handleVerifySilent()
  }, [hasValidationIssues, isNew, currentWorkflow, handleVerifySilent])

  const handleForceSaveSuccess = useCallback(
    (originalError: unknown) => {
      const issues = extractValidationErrors(originalError as Record<string, unknown>)
      if (issues) {
        dispatch({ type: 'SET_VALIDATION_ERRORS', payload: issues })
        useWorkflowStore.getState().setValidationErrorCount(issues.length)
      } else {
        handleVerifySilent()
      }
    },
    [dispatch, handleVerifySilent]
  )

  return { handleForceSaveSuccess, handleVerifySilent }
}
