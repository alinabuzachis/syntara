import type { Dispatch } from 'react'

import type { BuilderAction } from '../builderReducer'
import { useWorkflowVerification } from '../useWorkflowVerification'

type UseBuilderValidationParams = {
  dispatch: Dispatch<BuilderAction>
}

export function useBuilderValidation({ dispatch }: UseBuilderValidationParams) {
  const { handleVerifySilent } = useWorkflowVerification({ dispatch })

  return { handleVerifySilent }
}
