import { z } from 'zod'

/**
 * Project name pattern (aligned with backend validation).
 * Must start and end with a letter or number.
 * May contain letters, numbers, hyphens, underscores, or colons in between.
 */
const PROJECT_NAME_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9:_-]*[a-zA-Z0-9])?$/

export const PROJECT_NAME_VALIDATION_MESSAGE =
  'Project name can only contain letters, numbers, hyphens, underscores, or colons. It must start and end with a letter or number.'

/** Example-style placeholder for the project name field */
export const PROJECT_NAME_PLACEHOLDER = 'project-name'

/** Inline hint shown under the project name field before validation errors */
export const PROJECT_NAME_HINT =
  'Letters, numbers, hyphens, underscores, or colons (e.g. linux-team). Must start and end with a letter or number.'

/**
 * Zod schema for the project create/edit form.
 * Single source of truth for shape and client-side validation; backend 422 errors
 * are still applied via useFormMutationErrorHandler.
 */
export const projectFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Project name is required')
    .max(255, 'Project name must be 255 characters or fewer')
    .regex(PROJECT_NAME_PATTERN, PROJECT_NAME_VALIDATION_MESSAGE),
  description: z.string().max(2000, 'Description must be 2000 characters or fewer').optional().nullable(),
})

export type ProjectFormData = z.infer<typeof projectFormSchema>
