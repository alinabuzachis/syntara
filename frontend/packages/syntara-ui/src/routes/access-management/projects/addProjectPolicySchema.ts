import { z } from 'zod'

export const policyStatementSchema = z.object({
  effect: z.enum(['allow', 'deny']),
  actions: z.array(z.string()).min(1, 'At least one action is required'),
  scope: z.enum(['any', 'self']),
  conditions: z.record(z.string(), z.unknown()).optional().nullable(),
})

export const addProjectPolicySchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(255, 'Name must be 255 characters or fewer')
    .regex(
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
      'Name must be lowercase alphanumeric with hyphens, starting and ending with a letter or number'
    ),
  description: z.string().max(1024, 'Description must be 1024 characters or fewer').optional().or(z.literal('')),
  statementsJson: z
    .string()
    .min(1, 'Statements are required')
    .refine(
      (val) => {
        try {
          const parsed: unknown = JSON.parse(val) as unknown
          if (!Array.isArray(parsed)) return false
          const result = z.array(policyStatementSchema).safeParse(parsed)
          return result.success
        } catch {
          return false
        }
      },
      {
        message:
          'Must be a valid JSON array of statement objects with effect ("allow"/"deny"), actions (string[]), and scope ("any"/"self")',
      }
    ),
})

export type AddProjectPolicyFormData = z.infer<typeof addProjectPolicySchema>
