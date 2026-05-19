import { z } from 'zod'

/**
 * Zod schema for the user create/edit form.
 * The UI splits first/last name; the API uses a single `full_name` field.
 */
const baseSchema = z.object({
  username: z.string().min(1, 'Username is required').max(255, 'Username must be 255 characters or fewer'),
  first_name: z.string().min(1, 'First name is required').max(127, 'First name must be 127 characters or fewer'),
  last_name: z.string().max(127, 'Last name must be 127 characters or fewer').optional().or(z.literal('')),
  email: z.string().email('Must be a valid email address').max(255).optional().or(z.literal('')),
  password: z.string().min(8, 'Password must be at least 8 characters').optional().or(z.literal('')),
  is_enabled: z.boolean(),
  group_names: z.array(z.string()).optional(),
})

/** Schema that enforces password on create mode */
export const userCreateSchema = baseSchema.refine((data) => !!data.password && data.password.length >= 8, {
  message: 'Password is required (min 8 characters)',
  path: ['password'],
})

/** Schema for edit mode — password is optional */
export const userFormSchema = baseSchema

export type UserFormData = z.infer<typeof userFormSchema>

/** Join first/last name into full_name for the API */
export function toFullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim()
}

/** Split full_name into first/last for the form */
export function splitFullName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length <= 1) {
    return { first_name: parts[0] ?? '', last_name: '' }
  }
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') }
}
