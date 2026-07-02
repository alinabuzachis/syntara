import type { Activity, WorkflowAPI } from '@ansible/nexus-contracts'
import { useCallback, useState } from 'react'

import { workflowFetchClient } from '../../client'
import { useAlerts } from '../../providers/alerts'
import { useWorkflowStore } from '../../stores/useWorkflowStore'
import { getErrorMessage } from '../../utils/apiErrors'

import type { BuilderAction, ValidationError, ValidationSeverity } from './builderReducer'
import { validateWorkflow } from './utils/validation'
import { validateMinimumWorkflow } from './utils/validation/rules/validateMinimumWorkflow'
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

function lookupNodeName(nodeId: string | null): string | undefined {
  if (!nodeId) return undefined
  const activities = useWorkflowStore.getState().currentWorkflow?.workflow?.activities
  if (!activities) return undefined
  const match = activities.find((a) => a.id === nodeId)
  return match?.name ?? undefined
}

function mapValidationIssues(
  issues: ValidationResultError[] | undefined,
  severity: ValidationSeverity
): ValidationError[] {
  if (!issues?.length) return []
  return issues.map((e) => {
    const parsed = parseValidationMessage(e.message)
    const nodeId = resolveNodeId(e)
    return { ...parsed, nodeId, nodeName: parsed.nodeName ?? lookupNodeName(nodeId), severity }
  })
}

export function extractValidationErrors(
  err: Record<string, unknown> | undefined,
  activities?: Activity[]
): ValidationError[] | null {
  if (!err) return null

  const validationResult = err.validation_result as
    | {
        errors?: ValidationResultError[]
        warnings?: ValidationResultError[]
        findings?: Array<ValidationResultError & { severity?: string }>
      }
    | undefined

  if (!validationResult) return null

  if (validationResult.findings && Array.isArray(validationResult.findings)) {
    return validationResult.findings.map((f) => {
      if (activities) {
        const arrowResult = resolveArrowPathError(f, activities)
        if (arrowResult)
          return { ...arrowResult, severity: (f.severity === 'warning' ? 'warning' : 'error') as ValidationSeverity }
      }
      const parsed = parseValidationMessage(f.message)
      const severity: ValidationSeverity = f.severity === 'warning' ? 'warning' : 'error'
      const nodeId = resolveNodeId(f)
      return { ...parsed, nodeId, nodeName: parsed.nodeName ?? lookupNodeName(nodeId), severity }
    })
  }

  const errors = mapValidationIssues(validationResult.errors, 'error')
  const warnings = mapValidationIssues(validationResult.warnings, 'warning')
  const combined = errors.concat(warnings)
  return combined.length > 0 ? combined : null
}

type ValidateResponse = {
  data?: { valid?: boolean; errors?: ValidationResultError[]; warnings?: ValidationResultError[] }
  error?: unknown
  response: { ok: boolean }
}

function processValidateResponse(
  { data, error, response }: ValidateResponse,
  dispatch: (action: BuilderAction) => void,
  callbacks: {
    onValid?: () => void
    silent: boolean
    showSuccess: (opts: { title: string }) => void
    showError: (opts: { title: string; description: string }) => void
  }
): void {
  if (response.ok && data) {
    const issues = mapValidationIssues(data.errors, 'error').concat(mapValidationIssues(data.warnings, 'warning'))
    if (issues.length > 0) {
      dispatch({ type: 'SET_VALIDATION_ERRORS', payload: issues })
      useWorkflowStore.getState().setValidationErrorCount(issues.length)
      return
    }
    dispatch({ type: 'CLEAR_VALIDATION_ERRORS' })
    useWorkflowStore.getState().setValidationErrorCount(0)
    if (callbacks.onValid) {
      callbacks.onValid()
    } else if (!callbacks.silent) {
      callbacks.showSuccess({ title: 'Workflow definition is valid' })
    }
    return
  }

  const err = error as Record<string, unknown> | undefined
  const extracted = extractValidationErrors(err)
  if (extracted) {
    dispatch({ type: 'SET_VALIDATION_ERRORS', payload: extracted })
    useWorkflowStore.getState().setValidationErrorCount(extracted.length)
  } else {
    dispatch({ type: 'CLEAR_VALIDATION_ERRORS' })
    useWorkflowStore.getState().setValidationErrorCount(0)
    if (!callbacks.silent) {
      callbacks.showError({ title: 'Verification failed', description: getErrorMessage(err) })
    }
  }
}

type UseWorkflowVerificationOptions = Readonly<{
  dispatch: (action: BuilderAction) => void
}>

export function useWorkflowVerification({ dispatch }: UseWorkflowVerificationOptions) {
  const { showError, showSuccess } = useAlerts()
  const [isVerifying, setIsVerifying] = useState(false)
  const validationErrorCount = useWorkflowStore((state) => state.validationErrorCount)

  const handleVerify = useCallback(
    (onValid?: () => void, options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false
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
        if (!silent) {
          showError({ title: 'Verification failed', description: getErrorMessage(err) })
        }
        return
      }

      dispatch({ type: 'CLEAR_VALIDATION_ERRORS' })

      const frontendResult = validateWorkflow(activities, edges, { triggers })
      const minimumErrors = validateMinimumWorkflow(activities, edges, triggers)
      const allErrors = [...frontendResult.errors, ...minimumErrors]
      if (allErrors.length > 0) {
        const nameMap = new Map(activities.map((a) => [a.id, a.name ?? a.id]))
        dispatch({
          type: 'SET_VALIDATION_ERRORS',
          payload: allErrors.map((e) => ({
            message: e.message,
            nodeId: e.nodeId ?? null,
            nodeName: e.nodeId ? nameMap.get(e.nodeId) : undefined,
          })),
        })
        useWorkflowStore.getState().setValidationErrorCount(allErrors.length)
        return
      }

      setIsVerifying(true)
      workflowFetchClient
        .POST('/workflows/validate', {
          body: {
            workflow_definition: definition as unknown as WorkflowAPI.components['schemas']['WorkflowDefinition'],
          },
        })
        .then((resp) => {
          processValidateResponse(resp as ValidateResponse, dispatch, {
            onValid,
            silent,
            showSuccess,
            showError,
          })
        })
        .catch((err: unknown) => {
          dispatch({ type: 'CLEAR_VALIDATION_ERRORS' })
          useWorkflowStore.getState().setValidationErrorCount(0)
          if (!silent) {
            showError({ title: 'Verification failed', description: getErrorMessage(err) })
          }
        })
        .finally(() => setIsVerifying(false))
    },
    [dispatch, showError, showSuccess]
  )

  const handleVerifySilent = useCallback(
    (onValid?: () => void) => handleVerify(onValid, { silent: true }),
    [handleVerify]
  )

  return { handleVerify, handleVerifySilent, isVerifying, validationErrorCount }
}
