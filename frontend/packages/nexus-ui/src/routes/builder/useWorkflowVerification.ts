import type { Activity, WorkflowAPI } from '@ansible/nexus-contracts'
import { useCallback, useState } from 'react'

import { workflowFetchClient } from '../../client'
import { useAlerts } from '../../providers/alerts'
import { useWorkflowStore } from '../../stores/useWorkflowStore'
import { getErrorMessage } from '../../utils/apiErrors'

import type { BuilderAction, ValidationError } from './builderReducer'
import { validateWorkflow } from './utils/validation'
import { buildWorkflowDefinition } from './utils/workflowDefinitionBuilder'

type ValidationResultError = { message: string; node_id?: string | null }

// Backend error messages may embed Python-dict-like metadata: {'id': 'node-1', 'name': 'MyNode'} The actual error.
// These regexes extract structured data from that format. They become dead code once the backend always sends
// node_id and clean messages in WorkflowValidationError.
const NODE_ID_IN_MESSAGE = /'id':\s*'([a-zA-Z0-9_.-]+)'/
const NODE_NAME_IN_MESSAGE = /'name':\s*'([^']+)'/
const ERROR_SUFFIX_PATTERN = /}\s+(\S.*)$/
const ARROW_PATH_PATTERN = /^(?:workflow_definition -> )?(?:nodes|triggers) -> (\d+) -> (.+)/

export function resolveNodeId(error: ValidationResultError): string | null {
  if (error.node_id) return error.node_id
  const match = NODE_ID_IN_MESSAGE.exec(error.message)
  return match?.[1] ?? null
}

export function parseValidationMessage(raw: string): { message: string; nodeName?: string } {
  const nameMatch = NODE_NAME_IN_MESSAGE.exec(raw)
  const suffixMatch = ERROR_SUFFIX_PATTERN.exec(raw)
  if (nameMatch && suffixMatch) {
    return { message: `${nameMatch[1]}: ${suffixMatch[1]}`, nodeName: nameMatch[1] }
  }
  return { message: raw }
}

function resolveArrowPathError(error: ValidationResultError, activities: Activity[]): ValidationError | null {
  const match = ARROW_PATH_PATTERN.exec(error.message)
  if (!match) return null
  const index = Number.parseInt(match[1], 10)
  const rest = match[2]
  const activity = activities[index]
  if (!activity) return null
  return {
    message: rest,
    nodeId: activity.id,
    nodeName: activity.name ?? activity.id,
  }
}

export function extractValidationErrors(
  err: Record<string, unknown> | undefined,
  activities?: Activity[]
): ValidationError[] | null {
  if (!err) return null

  const validationResult = err.validation_result as { errors?: ValidationResultError[] } | undefined

  if (validationResult?.errors && Array.isArray(validationResult.errors)) {
    return validationResult.errors.map((e) => {
      if (activities) {
        const arrowResult = resolveArrowPathError(e, activities)
        if (arrowResult) return arrowResult
      }
      const parsed = parseValidationMessage(e.message)
      return { ...parsed, nodeId: resolveNodeId(e) }
    })
  }

  return null
}

type UseWorkflowVerificationOptions = Readonly<{
  dispatch: (action: BuilderAction) => void
}>

export function useWorkflowVerification({ dispatch }: UseWorkflowVerificationOptions) {
  const { showError, showSuccess } = useAlerts()
  const [isVerifying, setIsVerifying] = useState(false)
  const validationErrorCount = useWorkflowStore((state) => state.validationErrorCount)

  const handleVerify = useCallback(
    (onValid?: () => void) => {
      const { currentWorkflow, edges, nodePositions, _positionsUserModified } = useWorkflowStore.getState()
      if (!currentWorkflow) {
        dispatch({ type: 'SET_KEBAB_OPEN', payload: false })
        return
      }

      dispatch({ type: 'SET_KEBAB_OPEN', payload: false })

      const { activities } = currentWorkflow.workflow
      const triggers = currentWorkflow.triggers ?? []
      const name = currentWorkflow.name ?? 'workflow'
      const description = currentWorkflow.description ?? ''

      let definition: ReturnType<typeof buildWorkflowDefinition>
      try {
        definition = buildWorkflowDefinition(name, description, activities, triggers, {
          edges,
          nodePositions: _positionsUserModified ? nodePositions : {},
        })
      } catch (err: unknown) {
        dispatch({ type: 'CLEAR_VALIDATION_ERRORS' })
        useWorkflowStore.getState().setValidationErrorCount(0)
        showError({ title: 'Verification failed', description: getErrorMessage(err) })
        return
      }

      dispatch({ type: 'CLEAR_VALIDATION_ERRORS' })

      const frontendResult = validateWorkflow(activities, edges, { triggers })
      if (!frontendResult.valid) {
        const nameMap = new Map(activities.map((a) => [a.id, a.name ?? a.id]))
        dispatch({
          type: 'SET_VALIDATION_ERRORS',
          payload: frontendResult.errors.map((e) => ({
            message: e.message,
            nodeId: e.nodeId ?? null,
            nodeName: e.nodeId ? nameMap.get(e.nodeId) : undefined,
          })),
        })
        useWorkflowStore.getState().setValidationErrorCount(frontendResult.errors.length)
        return
      }

      setIsVerifying(true)
      workflowFetchClient
        .POST('/workflows/validate', {
          body: {
            workflow_definition: definition as unknown as WorkflowAPI.components['schemas']['WorkflowDefinition'],
          },
        })
        .then(({ data, error, response }) => {
          if (response.ok && data?.valid) {
            dispatch({ type: 'CLEAR_VALIDATION_ERRORS' })
            useWorkflowStore.getState().setValidationErrorCount(0)
            if (onValid) {
              onValid()
            } else {
              showSuccess({ title: 'Workflow definition is valid' })
            }
          } else if (response.ok && data && !data.valid) {
            const errors: ValidationError[] = (data.errors ?? []).map((e) => {
              const arrowResult = resolveArrowPathError(e, activities)
              if (arrowResult) return arrowResult
              const parsed = parseValidationMessage(e.message)
              return { ...parsed, nodeId: resolveNodeId(e) }
            })
            dispatch({ type: 'SET_VALIDATION_ERRORS', payload: errors })
            useWorkflowStore.getState().setValidationErrorCount(errors.length)
          } else {
            const err = error as Record<string, unknown> | undefined
            const extracted = extractValidationErrors(err, activities)
            if (extracted) {
              dispatch({ type: 'SET_VALIDATION_ERRORS', payload: extracted })
              useWorkflowStore.getState().setValidationErrorCount(extracted.length)
            } else {
              dispatch({ type: 'CLEAR_VALIDATION_ERRORS' })
              useWorkflowStore.getState().setValidationErrorCount(0)
              showError({
                title: 'Verification failed',
                description: getErrorMessage(err),
              })
            }
          }
        })
        .catch((err: unknown) => {
          dispatch({ type: 'CLEAR_VALIDATION_ERRORS' })
          useWorkflowStore.getState().setValidationErrorCount(0)
          showError({ title: 'Verification failed', description: getErrorMessage(err) })
        })
        .finally(() => setIsVerifying(false))
    },
    [dispatch, showError, showSuccess]
  )

  return { handleVerify, isVerifying, validationErrorCount }
}
