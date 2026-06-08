import { type IdentityProviderFormData } from './identityProviderFormSchema'

export type ClaimMappingField =
  | 'claimMapping.subject'
  | 'claimMapping.email'
  | 'claimMapping.username'
  | 'claimMapping.firstName'
  | 'claimMapping.lastName'
  | 'claimMapping.groups'

const CLAIM_FIELD_MAPPINGS: {
  key: string
  formField: ClaimMappingField
  formKey: keyof IdentityProviderFormData['claimMapping']
}[] = [
  { key: 'sub', formField: 'claimMapping.subject', formKey: 'subject' },
  { key: 'email', formField: 'claimMapping.email', formKey: 'email' },
  { key: 'username', formField: 'claimMapping.username', formKey: 'username' },
  { key: 'first_name', formField: 'claimMapping.firstName', formKey: 'firstName' },
  { key: 'last_name', formField: 'claimMapping.lastName', formKey: 'lastName' },
  { key: 'groups', formField: 'claimMapping.groups', formKey: 'groups' },
]

export function autoSelectClaimMappings(
  claimsSupported: string[],
  claimAliases: Record<string, string[]>,
  currentMapping: IdentityProviderFormData['claimMapping'],
  setFieldValue: (field: ClaimMappingField, value: string) => void
) {
  const supported = new Set(claimsSupported)
  for (const { key, formField, formKey } of CLAIM_FIELD_MAPPINGS) {
    const val = currentMapping[formKey]
    if (val && supported.has(val)) continue
    const aliases = claimAliases[key] ?? []
    const match = aliases.find((a) => supported.has(a))
    if (match) setFieldValue(formField, match)
  }
}
