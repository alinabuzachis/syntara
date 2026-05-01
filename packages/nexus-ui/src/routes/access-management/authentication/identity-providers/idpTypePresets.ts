/**
 * Pre-configured defaults for known IdP types.
 * Selecting an IdP type pre-fills scopes, claim mappings, and group mapping expression.
 */

export const IdpTypeKey = {
  AAP: 'aap',
  CUSTOM: 'custom',
} as const

export type IdpTypeKeyValue = (typeof IdpTypeKey)[keyof typeof IdpTypeKey]

export type IdpTypePreset = {
  label: string
  scopes: string
  claimMapping: {
    subject: string
    email: string
    username: string
    fullName: string
    groups: string | null
  }
  groupMappingExpression: string
}

export const IDP_TYPE_PRESETS: Record<string, IdpTypePreset> = {
  [IdpTypeKey.AAP]: {
    label: 'Ansible Automation Platform',
    scopes: 'read write openid roles',
    claimMapping: {
      subject: 'sub',
      email: 'email',
      username: 'preferred_username',
      fullName: 'name',
      groups: null,
    },
    groupMappingExpression: "[aap_teams[*].join('/', [organization, name]), aap_organizations[*].name] | []",
  },
  [IdpTypeKey.CUSTOM]: {
    label: 'Custom',
    scopes: 'openid profile email',
    claimMapping: {
      subject: 'sub',
      email: 'email',
      username: 'preferred_username',
      fullName: 'name',
      groups: null,
    },
    groupMappingExpression: 'groups[*]',
  },
}

export const IDP_TYPE_OPTIONS = Object.entries(IDP_TYPE_PRESETS).map(([value, preset]) => ({
  value,
  label: preset.label,
}))
