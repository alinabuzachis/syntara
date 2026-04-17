import { z } from 'zod'

import { optionalNumber } from './shared/formSchemaUtils'

/**
 * Zod schema for the AAP (Ansible Automation Platform) job template node form.
 *
 * Required fields: organization, jobTemplateName, jobTemplateId.
 * All other fields are optional prompt-on-launch / additional overrides.
 */
export const aapFormSchema = z
  .object({
    name: z.string(),
    credentialId: z.string().optional(),

    // ── Core fields (from cascading dropdowns) ────────────────────────
    organization: z.string().trim().min(1, 'Organization is required'),
    jobTemplateName: z.string().trim().min(1, 'Job template is required'),
    jobTemplateId: optionalNumber.optional(),

    // ── Prompt on Launch ──────────────────────────────────────────────
    inventory: z.string().optional(),
    inventoryId: optionalNumber.optional(),
    extraVars: z.string().optional(),
    limit: z.string().optional(),
    tags: z.string().optional(),
    skipTags: z.string().optional(),
    verbosity: z.string().optional(),
    credentials: z.array(z.number()).optional(),

    // ── Additional fields ─────────────────────────────────────────────
    jobType: z.string().optional(),
    forks: optionalNumber.optional(),
    timeout: optionalNumber.optional(),
    jobSlicing: optionalNumber.optional(),
    diffMode: z.boolean().optional(),
    executionEnvironment: z.string().optional(),
    executionEnvironmentId: optionalNumber.optional(),
    instanceGroup: z.string().optional(),
    instanceGroupId: optionalNumber.optional(),
    labels: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.jobTemplateId || !Number.isInteger(data.jobTemplateId) || data.jobTemplateId < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['jobTemplateName'],
        message: 'Job template must be selected',
      })
    }

    const v = data.extraVars?.trim()
    if (!v) return

    try {
      const parsed: unknown = JSON.parse(v)
      if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['extraVars'],
          message: 'Extra variables must be a JSON object',
        })
      }
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['extraVars'],
        message: 'Invalid JSON format',
      })
    }
  })

export type AAPFormData = z.infer<typeof aapFormSchema>
