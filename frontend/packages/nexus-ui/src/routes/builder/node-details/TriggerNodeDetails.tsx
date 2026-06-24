import { TriggerTypeEnum, WEBHOOK_TRIGGER_TYPES } from '@ansible/nexus-contracts'
import { useMemo, type ReactNode } from 'react'

import { useAlerts } from '../../../providers/alerts'
import { useWorkflowStoreActions } from '../../../stores/useWorkflowStore'
import type { Trigger } from '../../../stores/workflowStoreTypes'
import { parseJsonSchema } from '../../../utils/jsonSafeParse'
import { isValidWebhookPath, normalizeWebhookPath } from '../../../utils/webhookPath'
import type { TriggerFormData } from '../node-forms/TriggerNodeForm'
import { TriggerNodeForm } from '../node-forms/TriggerNodeForm'

/**
 * Deep equality check for triggers to prevent marking workflow dirty when no changes are made.
 */
function triggersEqual(a: Trigger, b: Trigger): boolean {
  if (a.id !== b.id) return false
  if (a.type !== b.type) return false
  if (a.name !== b.name) return false

  // Deep compare parameters objects
  const aParams = a.parameters ?? {}
  const bParams = b.parameters ?? {}
  const aKeys = Object.keys(aParams).sort((a, b) => a.localeCompare(b))
  const bKeys = Object.keys(bParams).sort((a, b) => a.localeCompare(b))

  if (aKeys.length !== bKeys.length) return false
  if (!aKeys.every((key, i) => key === bKeys[i])) return false

  // Compare parameters values - handle nested objects (like input_schema)
  return aKeys.every((key) => {
    const aVal = aParams[key]
    const bVal = bParams[key]
    if (aVal === bVal) return true
    if (typeof aVal !== typeof bVal) return false
    if (typeof aVal === 'object' && aVal !== null && bVal !== null) {
      return JSON.stringify(aVal) === JSON.stringify(bVal)
    }
    return false
  })
}

/**
 * SECURITY: Validate ISO 8601 duration/recurring interval format.
 * Prevents injection of malformed values that could cause backend errors.
 *
 * Accepts:
 * - Simple durations: PT1H, P1D
 * - Compound durations: P1DT12H30M, PT1H30M45S
 * - Recurring intervals: R/2024-01-01T00:00:00Z/P1D, R5/2024-01-01T00:00:00Z/PT1H
 *
 * Rejects:
 * - Empty durations: P, PT
 * - Malformed recurring: R/2024-01-01T00:00:00Z/Pgarbage
 * - Non-ISO format: "every day", "1 hour"
 */
function validateISO8601Interval(interval: string): boolean {
  // SECURITY: Strict ISO 8601 duration validation to prevent invalid or malicious inputs
  // Valid format: P[n]Y[n]M[n]W[n]DT[n]H[n]M[n]S (at least one component required)
  // Examples: P1D (1 day), PT1H (1 hour), P1Y2M3DT4H5M6S (compound)
  // Decimals only allowed for seconds: PT1.5S

  // SECURITY: Limit numeric values to prevent integer overflow and unrealistic durations in backend
  // Max 6 digits per component (allows up to 999,999 of any unit, still generous)
  // Max 4 digits per component (e.g., P9999D ≈ 27 years, PT9999H ≈ 416 days)
  const hasReasonableValues = (str: string): boolean => {
    const numbers = str.match(/\d+/g) ?? []
    return numbers.every((n) => n.length <= 4)
  }

  // Recurring interval: R[count]/datetime/duration
  if (interval.startsWith('R')) {
    const parts = interval.split('/')
    if (parts.length !== 3) return false
    const [count, datetime, duration] = parts
    if (!count.startsWith('R')) return false
    if (!datetime.includes('T')) return false
    if (!duration.startsWith('P')) return false
    if (!hasReasonableValues(count)) return false
    // Recursively validate the duration part (just the P... part)
    return validateISO8601Interval(duration)
  }

  // SECURITY: Strict structural validation - requires digits before designators
  // Allows optional decimal only for seconds: (\d+(\.\d+)?S)
  // Pattern breakdown:
  // - P: Required prefix
  // - (\d+Y)?: Optional years (digits required)
  // - (\d+M)?: Optional months (digits required)
  // - (\d+W)?: Optional weeks (digits required)
  // - (\d+D)?: Optional days (digits required)
  // - (T...)?: Optional time components (if present, T is required)
  //   - (\d+H)?: Optional hours (digits required)
  //   - (\d+M)?: Optional minutes (digits required)
  //   - (\d+(\.\d+)?S)?: Optional seconds with optional decimal (digits required)
  const durationPattern = /^P(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/

  if (!durationPattern.test(interval)) return false

  // Must have at least one component (not just P or PT)
  if (interval === 'P' || interval === 'PT') return false

  // SECURITY: Validate reasonable numeric values (max 8 digits per component)
  if (!hasReasonableValues(interval)) return false

  return true
}

function serializeInputSchema(rawSchema: unknown): string | undefined {
  if (typeof rawSchema === 'string') return rawSchema
  if (rawSchema && typeof rawSchema === 'object') return JSON.stringify(rawSchema, null, 2)
  return undefined
}

function buildScheduledTrigger(data: TriggerFormData, triggerId: string, name: string): Trigger {
  const scheduleType = (data.scheduleType ?? 'interval') as 'cron' | 'interval' | 'continuous'
  const scheduleValueMap: Record<string, string | undefined> = { interval: data.interval, cron: data.cron }
  const scheduleValue = scheduleValueMap[scheduleType]

  if (scheduleType === 'interval' && scheduleValue && !validateISO8601Interval(scheduleValue)) {
    throw new Error(
      `Invalid interval format: "${scheduleValue}". Expected ISO 8601 duration (e.g., PT1H, P1DT12H, PT1H30M) or recurring interval (e.g., R/2024-01-01T10:00:00Z/P1D).`
    )
  }

  return {
    id: triggerId,
    type: TriggerTypeEnum.SCHEDULED,
    name: name ?? 'Scheduled Trigger',
    parameters: {
      schedule_type: scheduleType,
      ...(scheduleValue && { [scheduleType]: scheduleValue }),
    },
  }
}

function buildWebhookStyleTrigger(
  data: TriggerFormData,
  triggerId: string,
  name: string,
  type: typeof TriggerTypeEnum.WEBHOOK_TRIGGER | typeof TriggerTypeEnum.EDA_TRIGGER
): Trigger {
  const webhookPath = normalizeWebhookPath(data.webhookPath ?? '')
  if (!webhookPath || !isValidWebhookPath(webhookPath)) {
    throw new Error('Webhook path is required and must be a valid slug')
  }
  const inputSchema = parseJsonSchema(data.inputSchema)
  if (data.inputSchema?.trim() && !inputSchema) {
    throw new Error('Invalid JSON schema — check syntax')
  }
  return {
    id: triggerId,
    type,
    name,
    parameters: {
      webhook_path: webhookPath,
      ...(inputSchema && { input_schema: inputSchema }),
    },
  }
}

function buildUpdatedTrigger(data: TriggerFormData, trigger: Trigger, name: string | undefined): Trigger {
  if (data.triggerType === TriggerTypeEnum.MANUAL_TRIGGER) {
    const inputSchema = parseJsonSchema(data.inputSchema)
    return {
      id: trigger.id ?? 'manual_trigger',
      type: TriggerTypeEnum.MANUAL_TRIGGER,
      name: name ?? 'Manual Trigger',
      parameters: {
        ...(inputSchema && { input_schema: inputSchema }),
      },
    }
  }
  if (data.triggerType === TriggerTypeEnum.SCHEDULED) {
    return buildScheduledTrigger(data, trigger.id ?? 'scheduled_trigger', name ?? 'Scheduled Trigger')
  }
  if (data.triggerType === TriggerTypeEnum.WEBHOOK_TRIGGER) {
    return buildWebhookStyleTrigger(
      data,
      trigger.id ?? 'webhook_trigger',
      name ?? 'Webhook Trigger',
      TriggerTypeEnum.WEBHOOK_TRIGGER
    )
  }
  if (data.triggerType === TriggerTypeEnum.EDA_TRIGGER) {
    return buildWebhookStyleTrigger(
      data,
      trigger.id ?? 'eda_trigger',
      name ?? 'EDA Trigger',
      TriggerTypeEnum.EDA_TRIGGER
    )
  }
  throw new Error('Invalid trigger type')
}

type TriggerNodeDetailsProps = {
  trigger: Trigger
  triggerIndex: number
  onClose: () => void
  onHeaderContentChange?: (content: ReactNode | null) => void
}

export function TriggerNodeDetails({ trigger, triggerIndex, onClose, onHeaderContentChange }: TriggerNodeDetailsProps) {
  const { showError } = useAlerts()
  // Use action accessor - component won't re-render when store state changes
  const { updateTrigger } = useWorkflowStoreActions()

  // Extract initial data from trigger — memoized to avoid new object refs on re-render
  const initialData = useMemo((): TriggerFormData => {
    if (trigger.type === TriggerTypeEnum.MANUAL_TRIGGER) {
      return {
        name: trigger.name,
        triggerType: TriggerTypeEnum.MANUAL_TRIGGER,
        inputSchema: serializeInputSchema(trigger.parameters?.input_schema),
      }
    }

    if (trigger.type === TriggerTypeEnum.SCHEDULED) {
      const scheduleType = (trigger.parameters?.schedule_type as string) ?? 'interval'
      if (scheduleType === 'interval') {
        return {
          name: trigger.name,
          triggerType: TriggerTypeEnum.SCHEDULED,
          scheduleType: 'interval',
          interval: trigger.parameters?.interval as string | undefined,
        }
      }

      if (scheduleType === 'cron') {
        return {
          name: trigger.name,
          triggerType: TriggerTypeEnum.SCHEDULED,
          scheduleType: 'cron',
          cron: trigger.parameters?.cron as string | undefined,
        }
      }

      if (scheduleType === 'continuous') {
        return {
          name: trigger.name,
          triggerType: TriggerTypeEnum.SCHEDULED,
          scheduleType: 'continuous',
        }
      }
    }

    if (WEBHOOK_TRIGGER_TYPES.has(trigger.type)) {
      return {
        name: trigger.name,
        triggerType: trigger.type,
        webhookPath: (trigger.parameters?.webhook_path as string) ?? '',
        inputSchema: serializeInputSchema(trigger.parameters?.input_schema),
      }
    }

    // Default fallback
    return {
      name: trigger.name,
      triggerType: TriggerTypeEnum.MANUAL_TRIGGER,
    }
  }, [trigger])

  const handleSubmit = (data: TriggerFormData) => {
    try {
      const name = data.name?.trim() || trigger.name
      const updatedTrigger = buildUpdatedTrigger(data, trigger, name)

      // Only update if the trigger actually changed
      if (!triggersEqual(trigger, updatedTrigger)) {
        updateTrigger(triggerIndex, updatedTrigger)
      }
      onClose()
    } catch (error) {
      showError({
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Failed to update trigger',
      })
    }
  }

  return (
    <TriggerNodeForm initialData={initialData} onSubmit={handleSubmit} onHeaderContentChange={onHeaderContentChange} />
  )
}
