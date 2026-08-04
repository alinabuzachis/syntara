import { z } from 'zod'

import { optionalNumber } from './shared/formSchemaUtils'
import { nodeSettingsSchema } from './shared/nodeSettingsSchema'

const loopFormSchemaBase = z.object({
  name: z.string(),
  type: z.enum(['forEach', 'while']),
  items: z.string().optional(),
  indexVariable: z.string().optional(),
  itemVariable: z.string().optional(),
  condition: z.string().optional(),
  maxIterations: optionalNumber.optional(),
  settings: nodeSettingsSchema.optional(),
})

export const loopFormSchema = loopFormSchemaBase

export type LoopFormData = z.infer<typeof loopFormSchemaBase>
