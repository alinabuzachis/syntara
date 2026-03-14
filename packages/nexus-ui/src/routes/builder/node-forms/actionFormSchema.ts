import { ExecutorTypeEnum } from '@ansible/nexus-contracts'
import { z } from 'zod'

/**
 * Zod schema for the Action node form.
 * Uses discriminatedUnion on executor: script requires code, api requires url.
 */
const httpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

const scriptActionSchema = z.object({
  executor: z.literal(ExecutorTypeEnum.SCRIPT),
  name: z.string(),
  code: z.string().trim().min(1, 'Script is required'),
  language: z.string().optional(),
  method: httpMethodSchema.optional(),
  url: z.string().optional(),
  authentication: z.string().optional(),
  headers: z.string().optional(),
  body: z.string().optional(),
  parameters: z.string().optional(),
})

const apiActionSchema = z.object({
  executor: z.literal(ExecutorTypeEnum.API),
  name: z.string(),
  code: z.string().optional(),
  language: z.string().optional(),
  method: httpMethodSchema.optional(),
  url: z.string().trim().min(1, 'URL is required'),
  authentication: z.string().optional(),
  headers: z.string().optional(),
  body: z.string().optional(),
  parameters: z.string().optional(),
})

export const actionFormSchema = z.discriminatedUnion('executor', [scriptActionSchema, apiActionSchema])

/** Validated form output (discriminated union). */
export type ActionFormData = z.infer<typeof actionFormSchema>

/** Form state / input type (allows empty code/url before validation). */
export type ActionFormValues = z.input<typeof actionFormSchema>
