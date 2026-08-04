import { z } from 'zod'

/**
 * Zod schema for the group create/edit form.
 * Single source of truth for shape and client-side validation; backend 422 errors
 * are still applied via useFormMutationErrorHandler.
 */
export const groupFormSchema = z.object({
  name: z.string().min(1, 'Group name is required').max(255, 'Group name must be 255 characters or fewer'),
  description: z.string().max(2000, 'Description must be 2000 characters or fewer').optional().nullable(),
})

export type GroupFormData = z.infer<typeof groupFormSchema>
