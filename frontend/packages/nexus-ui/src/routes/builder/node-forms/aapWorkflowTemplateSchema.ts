import { z } from 'zod'

import { hasExpressionValue } from '../utils/aapHelpers'

import { validateExtraVars } from './shared/aapSchemaUtils'
import { optionalNumber } from './shared/formSchemaUtils'
import { nodeSettingsSchema } from './shared/nodeSettingsSchema'

/**
 * Zod schema for the AAP (Ansible Automation Platform) workflow template node form.
 * Uses snake_case to match API contract.
 *
 * Required fields: organization_name, workflow_job_template_name, workflow_job_template_id.
 * Supported prompt-on-launch overrides: inventory, limit, scm_branch, labels, tags, skip_tags, extra_vars.
 *
 * Workflow templates do NOT support job-specific fields:
 * - job_type, verbosity, forks, timeout, job_slice_count, diff_mode
 * - execution_environment, instance_group, job_credentials
 */
export const aapWorkflowTemplateSchema = z
  .object({
    name: z.string(),
    credential_id: z.string().optional(),

    // ── Core fields (from cascading dropdowns) ────────────────────────
    organization_name: z.string().trim().min(1, 'Organization is required'),
    organization_id: optionalNumber.optional(),
    workflow_job_template_name: z.string().trim().min(1, 'Workflow template is required'),
    workflow_job_template_id: optionalNumber.optional(),

    // ── Prompt on Launch ──────────────────────────────────────────────
    inventory_name: z.string().optional(),
    inventory_id: optionalNumber.optional(),
    extra_vars: z.string().optional(),
    limit: z.string().optional(),
    scm_branch: z.string().optional(), // Workflow-specific: source control branch
    tags: z.string().optional(),
    skip_tags: z.string().optional(),
    labels: z.array(z.string()).optional(), // Label names (supports creating new labels)
    settings: nodeSettingsSchema.optional(),
  })
  .superRefine((data, ctx) => {
    // Skip validation when using expression mode (${...} expressions resolve at runtime)
    if (hasExpressionValue(data.workflow_job_template_name, data.organization_name)) {
      return
    }

    // Require either workflow_job_template_id OR workflow_job_template_name
    const hasId =
      data.workflow_job_template_id &&
      Number.isInteger(data.workflow_job_template_id) &&
      data.workflow_job_template_id > 0
    const hasName = data.workflow_job_template_name?.trim().length > 0

    if (!hasId && !hasName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['workflow_job_template_name'],
        message: 'Workflow template must be selected',
      })
    }

    validateExtraVars(data.extra_vars, ctx)
  })

export type AAPWorkflowTemplateFormData = z.infer<typeof aapWorkflowTemplateSchema>
