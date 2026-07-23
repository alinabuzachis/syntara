import { type ScheduleType, TriggerTypeEnum, type Activity } from '@ansible/nexus-contracts'

// ============================================================================
// Trigger Factory Functions
// ============================================================================

/** Create a manual trigger (v2). */
export function createManualTrigger(
  id: string,
  _requiresApproval?: boolean,
  name?: string,
  inputSchema?: Record<string, unknown>
): Activity {
  return {
    id,
    type: TriggerTypeEnum.MANUAL_TRIGGER,
    name: name ?? 'Manual Trigger',
    parameters: {
      ...(inputSchema && { input_schema: inputSchema }),
    },
  }
}

/**
 * Create a scheduled trigger (v2).
 * @note This trigger type is not yet in the v2 backend schema
 */
export function createScheduledTrigger(
  id: string,
  scheduleType: ScheduleType,
  config: {
    cron?: string
    timezone?: string
    interval?: string
    missed_schedule_policy?: string
  },
  name?: string
): Activity {
  return {
    id,
    type: TriggerTypeEnum.SCHEDULED,
    name: name ?? 'Scheduled Trigger',
    parameters: {
      schedule_type: scheduleType,
      ...(config.cron && { cron: config.cron }),
      ...(config.timezone && { timezone: config.timezone }),
      ...(config.interval && { interval: config.interval }),
      ...(config.missed_schedule_policy && { missed_schedule_policy: config.missed_schedule_policy }),
    },
  }
}

/**
 * Create an event trigger (v2).
 * @note This trigger type is not yet in the v2 backend schema
 */
export function createEventTrigger(
  id: string,
  source: string,
  eventType: string,
  filter?: Record<string, unknown>,
  name?: string
): Activity {
  return {
    id,
    type: TriggerTypeEnum.EVENT,
    name: name ?? 'Event Trigger',
    parameters: {
      source,
      event_type: eventType,
      ...(filter && { filter }),
    },
  }
}

type WebhookTriggerOptions = { inputSchema?: Record<string, unknown>; authorizedServiceAccountIds?: string[] }

function createWebhookStyleTrigger(
  id: string,
  webhookPath: string,
  type: typeof TriggerTypeEnum.WEBHOOK_TRIGGER | typeof TriggerTypeEnum.EDA_TRIGGER,
  name: string,
  options?: WebhookTriggerOptions
): Activity {
  return {
    id,
    type,
    name,
    parameters: {
      webhook_path: webhookPath,
      ...(options?.inputSchema && { input_schema: options.inputSchema }),
      ...(options?.authorizedServiceAccountIds?.length && {
        authorized_service_account_ids: options.authorizedServiceAccountIds,
      }),
    },
  }
}

/** Create a webhook trigger (v2). */
export function createWebhookTrigger(
  id: string,
  webhookPath: string,
  inputSchema?: Record<string, unknown>,
  name?: string,
  authorizedServiceAccountIds?: string[]
): Activity {
  return createWebhookStyleTrigger(id, webhookPath, TriggerTypeEnum.WEBHOOK_TRIGGER, name ?? 'Webhook Trigger', {
    inputSchema,
    authorizedServiceAccountIds,
  })
}

/** Create an EDA trigger (v2). */
export function createEdaTrigger(
  id: string,
  webhookPath: string,
  inputSchema?: Record<string, unknown>,
  name?: string,
  authorizedServiceAccountIds?: string[]
): Activity {
  return createWebhookStyleTrigger(id, webhookPath, TriggerTypeEnum.EDA_TRIGGER, name ?? 'EDA Trigger', {
    inputSchema,
    authorizedServiceAccountIds,
  })
}
