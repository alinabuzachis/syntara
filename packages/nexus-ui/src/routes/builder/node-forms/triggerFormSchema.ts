import { TriggerTypeEnum } from '@ansible/nexus-contracts'
import { z } from 'zod'

import { safeJSONReviver } from '../../../utils/jsonSafeParse'
import { isValidWebhookPath } from '../../../utils/webhookPath'

/**
 * Validate that inputSchema is a valid JSON object if provided.
 * Uses safeJSONReviver to strip prototype pollution keys during parsing.
 * Shared by manual and webhook trigger validation.
 */
function validateInputSchemaJson(data: z.infer<typeof triggerFormSchemaBase>, ctx: z.RefinementCtx) {
  const schemaText = data.inputSchema?.trim() ?? ''
  if (schemaText) {
    if (schemaText.length > 100_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Input schema must be 100KB or less',
        path: ['inputSchema'],
      })
      return
    }
    try {
      const parsed: unknown = JSON.parse(schemaText, safeJSONReviver)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Input schema must be a JSON object',
          path: ['inputSchema'],
        })
      }
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid JSON — check syntax',
        path: ['inputSchema'],
      })
    }
  }
}

/**
 * Validate webhook-specific fields: webhookPath is required with format validation.
 */
function validateWebhookPath(data: z.infer<typeof triggerFormSchemaBase>, ctx: z.RefinementCtx) {
  const trimmed = data.webhookPath?.trim() ?? ''

  // Strip leading slashes before pattern check (normalization happens on submit)
  const normalized = trimmed.replace(/^\/+/, '').toLowerCase()

  if (!normalized) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Webhook path is required',
      path: ['webhookPath'],
    })
    return
  }

  if (normalized.length > 128) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Webhook path must be 128 characters or fewer',
      path: ['webhookPath'],
    })
    return
  }

  if (!isValidWebhookPath(normalized)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        'Path must start and end with a letter or number, and contain only lowercase letters, numbers, hyphens, and underscores',
      path: ['webhookPath'],
    })
  }
}

/**
 * Zod schema for the Trigger node form.
 * Validates manual triggers (inputSchema must be valid JSON if provided),
 * schedule triggers (interval required), and webhook triggers
 * (webhookPath required with format validation, inputSchema must be valid JSON).
 *
 * Both manual and webhook triggers use `inputSchema` to match the backend's
 * `config.input_schema` key (used for both trigger types).
 */
const triggerFormSchemaBase = z.object({
  name: z.string().optional(),
  triggerType: z.string(),
  scheduleType: z.string().optional(),
  interval: z.string().optional(),
  inputSchema: z.string().optional(),
  webhookPath: z.string().optional(),
})

export const triggerFormSchema = triggerFormSchemaBase.superRefine((data, ctx) => {
  if (data.triggerType === TriggerTypeEnum.MANUAL_TRIGGER) {
    validateInputSchemaJson(data, ctx)
  }

  if (data.triggerType === TriggerTypeEnum.SCHEDULED && data.scheduleType === 'interval') {
    if (!data.interval?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Start date is required',
        path: ['interval'],
      })
    }
  }

  if (data.triggerType === TriggerTypeEnum.WEBHOOK_TRIGGER) {
    validateWebhookPath(data, ctx)
    validateInputSchemaJson(data, ctx)
  }
})

export type TriggerFormData = z.infer<typeof triggerFormSchemaBase>

// Re-export webhook path utilities from their canonical location
export { normalizeWebhookPath, isValidWebhookPath } from '../../../utils/webhookPath'
