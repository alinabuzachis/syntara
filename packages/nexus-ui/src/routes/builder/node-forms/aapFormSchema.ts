import { z } from 'zod'

import { hasExpressionValue } from '../utils/aapHelpers'

import { optionalNumber } from './shared/formSchemaUtils'

/**
 * Zod schema for the AAP (Ansible Automation Platform) job template node form.
 * Uses snake_case to match API contract.
 *
 * Required fields: organization_name, job_template_name, job_template_id.
 * All other fields are optional prompt-on-launch / additional overrides.
 */
export const aapFormSchema = z
  .object({
    name: z.string(),
    credential_id: z.string().optional(),

    // ── Core fields (from cascading dropdowns) ────────────────────────
    organization_name: z.string().trim().min(1, 'Organization is required'),
    job_template_name: z.string().trim().min(1, 'Job template is required'),
    job_template_id: optionalNumber.optional(),

    // ── Prompt on Launch ──────────────────────────────────────────────
    inventory_name: z.string().optional(),
    inventory_id: optionalNumber.optional(),
    extra_vars: z.string().optional(),
    limit: z.string().optional(),
    tags: z.string().optional(),
    skip_tags: z.string().optional(),
    verbosity: z.string().optional(),
    job_credentials: z.array(z.number()).optional(),

    // ── Additional fields ─────────────────────────────────────────────
    job_type: z.string().optional(),
    forks: optionalNumber.optional(),
    timeout: optionalNumber.optional(),
    job_slice_count: optionalNumber.optional(),
    diff_mode: z.boolean().optional(),
    execution_environment: z.string().optional(),
    execution_environment_id: optionalNumber.optional(),
    instance_group: z.string().optional(),
    instance_group_id: optionalNumber.optional(),
    labels: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // Skip job_template_id check when using expression mode (${...} expressions resolve at runtime)
    if (
      !hasExpressionValue(data.job_template_name, data.organization_name) &&
      (!data.job_template_id || !Number.isInteger(data.job_template_id) || data.job_template_id < 1)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['job_template_name'],
        message: 'Job template must be selected',
      })
    }

    const v = data.extra_vars?.trim()
    if (!v) return

    try {
      const parsed: unknown = JSON.parse(v)
      if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['extra_vars'],
          message: 'Extra variables must be a JSON object',
        })
      }
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['extra_vars'],
        message: 'Invalid JSON format',
      })
    }
  })

export type AAPFormData = z.infer<typeof aapFormSchema>
