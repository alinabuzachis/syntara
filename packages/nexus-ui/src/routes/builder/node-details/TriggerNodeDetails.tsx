import { TriggerTypeEnum } from '@ansible/nexus-contracts'
import type { ReactNode } from 'react'

import { useAlerts } from '../../../components/alerts'
import { useWorkflowStoreActions } from '../../../stores/useWorkflowStore'
import type { Trigger as StoreTrigger } from '../../../stores/workflowStoreTypes'
import type { TriggerFormData } from '../node-forms/TriggerNodeForm'
import { TriggerNodeForm } from '../node-forms/TriggerNodeForm'

/**
 * In v2, triggers are { id, type, name, config } nodes.
 * Manual trigger type is 'manual_trigger'.
 */
type Trigger = {
  id?: string
  type: string
  name?: string
  config?: Record<string, unknown>
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

function parseInputSchemaConfig(inputSchema: string | undefined): Record<string, unknown> {
  const config: Record<string, unknown> = {}
  if (!inputSchema?.trim()) return config
  try {
    config.input_schema = JSON.parse(inputSchema.trim()) as Record<string, unknown>
  } catch {
    throw new Error('Input schema must be valid JSON')
  }
  return config
}

function serializeInputSchema(rawSchema: unknown): string | undefined {
  if (typeof rawSchema === 'string') return rawSchema
  if (rawSchema && typeof rawSchema === 'object') return JSON.stringify(rawSchema, null, 2)
  return undefined
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

  // Extract initial data from trigger
  const getInitialData = (): TriggerFormData => {
    if (trigger.type === TriggerTypeEnum.MANUAL_TRIGGER) {
      return {
        name: trigger.name,
        triggerType: TriggerTypeEnum.MANUAL_TRIGGER,
        inputSchema: serializeInputSchema(trigger.config?.input_schema),
      }
    }

    if (trigger.type === TriggerTypeEnum.SCHEDULED) {
      const scheduleType = (trigger.config?.schedule_type as string) ?? 'interval'
      if (scheduleType === 'interval') {
        return {
          name: trigger.name,
          triggerType: TriggerTypeEnum.SCHEDULED,
          scheduleType: 'interval',
          interval: trigger.config?.interval as string | undefined,
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

    // Default fallback
    return {
      name: trigger.name,
      triggerType: TriggerTypeEnum.MANUAL_TRIGGER,
    }
  }

  const handleSubmit = (data: TriggerFormData) => {
    try {
      let updatedTrigger: Trigger

      // When editing, use the form data name if provided, otherwise keep the original name
      const name = data.name?.trim() || trigger.name

      if (data.triggerType === TriggerTypeEnum.MANUAL_TRIGGER) {
        const triggerId = trigger.id ?? 'manual_trigger'
        updatedTrigger = {
          id: triggerId,
          type: 'manual_trigger',
          name: name ?? 'Manual Trigger',
          config: parseInputSchemaConfig(data.inputSchema),
        } as unknown as Trigger
      } else if (data.triggerType === TriggerTypeEnum.SCHEDULED) {
        const triggerId = trigger.id ?? 'scheduled_trigger'
        const scheduleType = (data.scheduleType ?? 'interval') as 'cron' | 'interval' | 'continuous'
        const config: { cron?: string; timezone?: string; interval?: string } = {}
        if (scheduleType === 'interval' && data.interval) {
          // SECURITY: Validate ISO 8601 duration/recurring interval format before using interval
          if (!validateISO8601Interval(data.interval)) {
            throw new Error(
              `Invalid interval format: "${data.interval}". Expected ISO 8601 duration (e.g., PT1H, P1DT12H, PT1H30M) or recurring interval (e.g., R/2024-01-01T10:00:00Z/P1D).`
            )
          }
          config.interval = data.interval
        }
        // Create trigger with explicit parameters to avoid any potential argument shifting issues
        updatedTrigger = {
          id: triggerId,
          type: 'scheduled',
          name: name ?? 'Scheduled Trigger',
          config: {
            schedule_type: scheduleType,
            ...(config.interval && { interval: config.interval }),
          },
        } as unknown as Trigger
      } else {
        throw new Error('Invalid trigger type')
      }

      updateTrigger(triggerIndex, updatedTrigger as unknown as StoreTrigger)
      onClose()
    } catch (error) {
      showError({
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Failed to update trigger',
      })
    }
  }

  return (
    <TriggerNodeForm
      initialData={getInitialData()}
      onSubmit={handleSubmit}
      onHeaderContentChange={onHeaderContentChange}
    />
  )
}
