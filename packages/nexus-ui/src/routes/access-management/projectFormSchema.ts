import { z } from 'zod'

/**
 * Zod schema for the project create/edit form.
 * Single source of truth for shape and client-side validation; backend 422 errors
 * are still applied via useFormMutationErrorHandler.
 */
export const projectFormSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(255, 'Project name must be 255 characters or fewer'),
  description: z.string().max(2000, 'Description must be 2000 characters or fewer').optional().nullable(),
})

export type ProjectFormData = z.infer<typeof projectFormSchema>
