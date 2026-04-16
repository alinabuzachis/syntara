import { ActivityTypeEnum, ExecutorTypeEnum, type Activity, type TaskActivity } from '@ansible/nexus-contracts'
import type { ReactNode } from 'react'

import { useAlerts } from '../../../components/alerts'
import {
  detectTaskNodeType,
  DetectedExecutorType,
} from '../../../routes/automations/canvas/nodes/common/detectTaskNodeType'
import { createAAPJobTemplateActivity, useWorkflowStoreActions } from '../../../stores/useWorkflowStore'
import type { ActionFormData as RegistryActionFormData } from '../hooks/useNodeCreation'
import { AAPNodeForm } from '../node-forms/AAPNodeForm'
import type { AAPFormData } from '../node-forms/AAPNodeForm'
import { ActionNodeForm } from '../node-forms/ActionNodeForm'
import { buildAAPConfig, parsePositiveInt } from '../utils/aapHelpers'

import { AIAgentNodeDetails } from './AIAgentNodeDetails'
import { buildRegistryActionInitialData, buildRegistryActivityUpdate, safeJSONReviver } from './taskNodeSubmitHelpers'

type TaskNodeDetailsProps = Readonly<{
  taskData: Activity
  nodeId: string
  onClose: () => void
  onHeaderContentChange: (content: ReactNode | null) => void
}>

type AAPTaskDetailsSectionProps = Readonly<{
  taskData: TaskActivity
  nodeId: string
  onClose: () => void
  onHeaderContentChange: (content: ReactNode | null) => void
}>

function AAPTaskDetailsSection({ taskData, nodeId, onClose, onHeaderContentChange }: AAPTaskDetailsSectionProps) {
  const { showError } = useAlerts()
  const { updateActivity } = useWorkflowStoreActions()

  const config = (taskData.config ?? {}) as {
    job_template_id?: number
    inventory_id?: number
    credentials?: number[]
    extra_vars?: Record<string, unknown>
    limit?: string
    tags?: string
    skip_tags?: string
    verbosity?: number
    jobTemplateId?: number
    inventory?: number
    extraVars?: Record<string, unknown>
    skipTags?: string
    credentialId?: string
  }

  const jobTemplateId = config.job_template_id ?? config.jobTemplateId
  const inventory = config.inventory_id ?? config.inventory
  const extraVars = config.extra_vars ?? config.extraVars
  const skipTags = config.skip_tags ?? config.skipTags

  const aapInitialData: Partial<AAPFormData> = {
    name: taskData.name,
    jobTemplateId: jobTemplateId?.toString() ?? '',
    inventory: inventory?.toString() ?? '',
    credentials: config.credentials?.join(',') ?? '',
    extraVars: extraVars ? JSON.stringify(extraVars, null, 2) : '',
    limit: config.limit ?? '',
    tags: config.tags ?? '',
    skipTags: skipTags ?? '',
    verbosity: config.verbosity?.toString() ?? '',
    credentialId: config.credentialId ?? undefined,
  }

  const handleAAPSubmit = (data: AAPFormData) => {
    try {
      const parsedJobTemplateId = parsePositiveInt(data.jobTemplateId)
      if (!parsedJobTemplateId) {
        throw new Error('Job Template ID must be a valid positive integer')
      }

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

export function TaskNodeDetails({ taskData, nodeId, onClose, onHeaderContentChange }: TaskNodeDetailsProps) {
  const { showError } = useAlerts()
  const { updateActivity } = useWorkflowStoreActions()

  if (taskData.type === ActivityTypeEnum.APPROVAL) {
    return null
  }

  const executor = taskData.type
  const { actualExecutor, detectedExecutorType } = detectTaskNodeType(taskData as TaskActivity)
  const config = taskData.config ?? {}

  const isAAPTask =
    detectedExecutorType === DetectedExecutorType.AAP || actualExecutor === ExecutorTypeEnum.AAP_JOB_TEMPLATE
  if (isAAPTask) {
    return (
      <AAPTaskDetailsSection
        taskData={taskData as TaskActivity}
        nodeId={nodeId}
        onClose={onClose}
        onHeaderContentChange={onHeaderContentChange}
      />
    )
  }

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

  if (executor !== ExecutorTypeEnum.SCRIPT && executor !== ExecutorTypeEnum.HTTP_REQUEST) {
    return null
  }

  const initialData = buildRegistryActionInitialData(executor, config, taskData as TaskActivity)

  const handleSubmit = (data: RegistryActionFormData) => {
    try {
      if (data.executor === ExecutorTypeEnum.HTTP_REQUEST && data.headers) {
        try {
          JSON.parse(data.headers, safeJSONReviver)
        } catch {
          showError(
            'Invalid Headers Format',
            'Headers must be valid JSON. Please fix the format before saving. Example: {"Content-Type":"application/json"}'
          )
          return
        }
      }

      const updatedActivity = buildRegistryActivityUpdate(taskData as TaskActivity, data)
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
