import { z } from 'zod'

/**
 * Zod schema for the AAP (Ansible Automation Platform) job template node form.
 * jobTemplateId required (non-whitespace); extraVars optional but must be valid JSON when non-empty.
 */
export const aapFormSchema = z
  .object({
    name: z.string(),
    jobTemplateId: z.string().trim().min(1, 'Job template ID is required'),
    inventory: z.string().optional(),
    credentials: z.string().optional(),
    extraVars: z.string().optional(),
    limit: z.string().optional(),
    tags: z.string().optional(),
    skipTags: z.string().optional(),
    verbosity: z.string().optional(),
    credentialId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
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
