import { z } from 'zod'

/**
 * Zod schema for the credential create/edit form.
 *
 * Static fields (name, description, credential_type_id) are validated by Zod.
 * Dynamic credential inputs are stored as a Record and validated at submit time
 * via superRefine, because the required fields depend on the selected credential type.
 */
export const credentialFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional().nullable(),
  credential_type_id: z.string().min(1, 'Credential type is required'),
  inputs: z.record(z.string(), z.any()),
})

export type CredentialFormData = z.infer<typeof credentialFormSchema>
