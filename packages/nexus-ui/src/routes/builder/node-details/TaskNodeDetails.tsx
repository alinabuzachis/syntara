import { ActivityTypeEnum, ExecutorTypeEnum, type Activity, type TaskActivity } from '@ansible/nexus-contracts'
import type { ReactNode } from 'react'

import { useAlerts } from '../../../components/alerts'
import {
  detectTaskNodeType,
  DetectedExecutorType,
} from '../../../routes/automations/canvas/nodes/common/detectTaskNodeType'
import { createAAPJobTemplateActivity, useWorkflowStoreActions } from '../../../stores/useWorkflowStore'
import type { AAPJobTemplateConfig } from '../../../stores/workflowFactories'
import type { ActionFormData as RegistryActionFormData } from '../hooks/useNodeCreation'
import { AAPNodeForm } from '../node-forms/AAPNodeForm'
import type { AAPFormData } from '../node-forms/AAPNodeForm'
import { ActionNodeForm } from '../node-forms/ActionNodeForm'
import { buildAAPConfig, validateJobTemplateId } from '../utils/aapHelpers'

import { AIAgentNodeDetails } from './AIAgentNodeDetails'

/**
 * Stored AAP config supports both snake_case (API) and camelCase (legacy) field names.
 * Extends AAPJobTemplateConfig with snake_case API fields for backend compatibility.
 */
type StoredAAPConfig = AAPJobTemplateConfig & {
  // Snake_case API field names (backend format)
  credential_id?: string
  job_template_id?: number
  job_template_name?: string
  inventory_id?: number
  inventory_name?: string
  extra_vars?: Record<string, unknown>
  skip_tags?: string
  job_type?: string
  job_slice_count?: number
  diff_mode?: boolean
  execution_environment?: string
  instance_groups?: string

  // Index signature for unknown fields
  [key: string]: unknown
}

/**
 * SECURITY: JSON.parse reviver that strips prototype pollution keys during parsing.
 */
function safeJSONReviver(key: string, value: unknown): unknown {
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
    return undefined
  }
  return value
}

/** Stringify extra vars object or return empty string. */
function serializeExtraVars(extraVars: Record<string, unknown> | undefined): string {
  return extraVars ? JSON.stringify(extraVars, null, 2) : ''
}

/** Get field value with snake_case → camelCase fallback. */
function getField<T>(snakeCase: T | undefined, camelCase: T | undefined, defaultValue: T): T {
  return snakeCase ?? camelCase ?? defaultValue
}

/**
 * Type guard to check if config has AAP job template fields.
 */
function hasJobTemplateConfig(config: Record<string, unknown>): config is StoredAAPConfig {
  return 'job_template_id' in config || 'jobTemplateId' in config
}

/**
 * Parse and validate headers JSON, returning parsed object or null on error.
 * Shows error alert if JSON is invalid.
 * Returns undefined if headersJSON is undefined (no headers provided).
 * Returns null if JSON parsing fails (validation error).
 */
function parseHeaders(
  headersJSON: string | undefined,
  showError: (title: string, message: string) => void
): Record<string, string> | undefined | null {
  if (!headersJSON) return undefined

  try {
    return JSON.parse(headersJSON, safeJSONReviver) as Record<string, string>
  } catch {
    showError(
      'Invalid Headers Format',
      'Headers must be valid JSON. Please fix the format before saving. Example: {"Content-Type":"application/json"}'
    )
    return null
  }
}

/**
 * Build activity config and validate form data for submission.
 * Returns config object or null if validation fails.
 */
function buildActivityConfig(
  data: RegistryActionFormData,
  showError: (title: string, message: string) => void
):
  | { language: string; code: string; credentialId?: string }
  | { method: string; url: string; headers?: Record<string, string>; body?: unknown; credentialId?: string }
  | null {
  const isScript = data.executor === ExecutorTypeEnum.SCRIPT

  if (isScript) {
    return buildScriptConfig(data)
  }

  // HTTP Request validation and building
  const parsedHeaders = parseHeaders(data.headers, showError)
  if (parsedHeaders === null) return null // Validation failed

  const mergedHeaders = mergeAuthHeaders(parsedHeaders, data.authentication)
  return buildHTTPConfig(data, mergedHeaders)
}

/**
 * Merge headers with authentication if present.
 */
function mergeAuthHeaders(
  headers: Record<string, string> | undefined,
  authentication: string | undefined
): Record<string, string> | undefined {
  if (!authentication) return headers
  if (!headers) return { Authorization: authentication }
  return { ...headers, Authorization: authentication }
}

/**
 * Build HTTP request config from form data.
 */
function buildHTTPConfig(
  data: RegistryActionFormData,
  headers: Record<string, string> | undefined
): { method: string; url: string; headers?: Record<string, string>; body?: unknown; credentialId?: string } {
  return {
    method: data.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: data.url!,
    ...(headers && { headers }),
    ...(data.body && {
      body: (() => {
        try {
          return JSON.parse(data.body, safeJSONReviver) as unknown
        } catch {
          return data.body
        }
      })(),
    }),
    ...(data.credentialId && { credentialId: data.credentialId }),
  }
}

/**
 * Serialize body config for HTTP request.
 */
function serializeBody(body: unknown): string {
  if (typeof body === 'string') return body
  return JSON.stringify(body, null, 2)
}

/**
 * Build script config from form data.
 */
function buildScriptConfig(data: RegistryActionFormData): { language: string; code: string; credentialId?: string } {
  return {
    language: data.language ?? 'python',
    code: data.code!,
    ...(data.credentialId && { credentialId: data.credentialId }),
  }
}

/**
 * Build initial form data from a stored AAP config.
 * Handles both snake_case (API) and camelCase (legacy) field names.
 */
function buildAAPInitialData(taskName: string, config: Record<string, unknown>): Partial<AAPFormData> {
  if (!hasJobTemplateConfig(config)) {
    return { name: taskName }
  }
  const c = config

  return {
    name: taskName,
    credentialId: c.credential_id ?? c.credentialId,
    organization: c.organization ?? '',
    jobTemplateName: getField(c.job_template_name, c.jobTemplateName, ''),
    jobTemplateId: (c.job_template_id ?? c.jobTemplateId) as number | undefined,
    inventory: getField(c.inventory_name, c.inventoryName, ''),
    inventoryId: c.inventory_id ?? c.inventory,
    extraVars: serializeExtraVars(c.extra_vars ?? c.extraVars),
    limit: c.limit ?? '',
    tags: c.tags ?? '',
    skipTags: c.skip_tags ?? c.skipTags ?? '',
    verbosity: c.verbosity?.toString() ?? '',
    credentials: c.credentials ?? [],
    jobType: getField(c.job_type, c.jobType, ''),
    forks: c.forks,
    timeout: c.timeout,
    jobSlicing: c.job_slice_count ?? c.jobSlicing,
    diffMode: getField(c.diff_mode, c.diffMode, false),
    executionEnvironment: getField(c.execution_environment, c.executionEnvironment, ''),
    instanceGroup: getField(c.instance_groups, c.instanceGroups, ''),
    labels: c.labels ?? '',
  }
}

interface TaskNodeDetailsProps {
  readonly taskData: Activity
  readonly nodeId: string
  readonly onClose: () => void
  readonly onHeaderContentChange: (content: ReactNode | null) => void
}

export function TaskNodeDetails({ taskData, nodeId, onClose, onHeaderContentChange }: Readonly<TaskNodeDetailsProps>) {
  const { showError } = useAlerts()
  // Use action accessor - component won't re-render when store state changes
  const { updateActivity } = useWorkflowStoreActions()

  // Don't show action form for approval nodes - they have their own form
  if (taskData.type === ActivityTypeEnum.APPROVAL) {
    return null
  }

  // In v2, activity.type IS the executor directly
  const executor = taskData.type

  // Detect the actual node type - handles disguised AAP/connector nodes
  const { actualExecutor, detectedExecutorType } = detectTaskNodeType(taskData as TaskActivity)

  // In v2, config is at activity.config (not activity.task.config)
  const config = taskData.config ?? {}

  // AAP (incl. connector-backed with executor still "agentic") must be checked before the generic
  // agentic branch, or those tasks would incorrectly show AI Agent details.
  const isAAPTask =
    detectedExecutorType === DetectedExecutorType.AAP || actualExecutor === ExecutorTypeEnum.AAP_JOB_TEMPLATE
  if (isAAPTask) {
    const aapInitialData = buildAAPInitialData(taskData.name ?? '', config)

    const handleAAPSubmit = (data: AAPFormData) => {
      try {
        // Validate jobTemplateId (required, set by dropdown selection)
        const parsedJobTemplateId = validateJobTemplateId(data.jobTemplateId)

        const aapNodeConfig = buildAAPConfig(data)
        const updatedActivity = createAAPJobTemplateActivity(nodeId, data.name, parsedJobTemplateId, aapNodeConfig)

        updateActivity(nodeId, updatedActivity)
        onClose()
      } catch (error) {
        showError(error instanceof Error ? error.message : 'Failed to update step', 'Update Failed')
      }
    }

    return (
      <AAPNodeForm
        initialData={aapInitialData}
        submitButtonText="Update step"
        onSubmit={handleAAPSubmit}
        onCancel={onClose}
        onHeaderContentChange={onHeaderContentChange}
      />
    )
  }

  // True agentic tasks (not AAP-in-disguise)
  if (executor === ExecutorTypeEnum.AGENTIC) {
    return (
      <AIAgentNodeDetails
        taskData={taskData}
        nodeId={nodeId}
        onClose={onClose}
        onHeaderContentChange={onHeaderContentChange}
      />
    )
  }

  // Handle standard executors (script, http_request)
  if (executor !== ExecutorTypeEnum.SCRIPT && executor !== ExecutorTypeEnum.HTTP_REQUEST) {
    return null
  }

  const serializedBody =
    executor === ExecutorTypeEnum.HTTP_REQUEST && config.body ? serializeBody(config.body) : undefined

  const initialData: Partial<RegistryActionFormData> = {
    name: taskData.name,
    executor: executor === ExecutorTypeEnum.SCRIPT ? ExecutorTypeEnum.SCRIPT : ExecutorTypeEnum.HTTP_REQUEST,
    language: executor === ExecutorTypeEnum.SCRIPT ? (config.language as string | undefined) : undefined,
    code: executor === ExecutorTypeEnum.SCRIPT ? (config.code as string | undefined) : undefined,
    method:
      executor === ExecutorTypeEnum.HTTP_REQUEST
        ? (config.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | undefined)
        : undefined,
    url: executor === ExecutorTypeEnum.HTTP_REQUEST ? (config.url as string | undefined) : undefined,
    headers:
      executor === ExecutorTypeEnum.HTTP_REQUEST && config.headers
        ? JSON.stringify(config.headers, null, 2)
        : undefined,
    body: serializedBody,
    credentialId: (config as { credentialId?: string }).credentialId ?? undefined,
  }

  const handleSubmit = (data: RegistryActionFormData) => {
    try {
      const config = buildActivityConfig(data, showError)
      if (!config) return // Validation failed

      const updatedActivity = {
        ...taskData,
        name: data.name,
        type: data.executor,
        config,
      } as Activity

      updateActivity(nodeId, updatedActivity)
      onClose()
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to update step', 'Update Failed')
    }
  }

  return (
    <ActionNodeForm
      initialData={initialData}
      submitButtonText="Update step"
      onSubmit={handleSubmit}
      onHeaderContentChange={onHeaderContentChange}
    />
  )
}
