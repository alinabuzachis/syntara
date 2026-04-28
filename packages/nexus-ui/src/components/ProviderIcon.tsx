import { AnsibleTowerIcon, GlobeIcon, MicrosoftIcon } from '@patternfly/react-icons'

import { IdpTypeKey } from '../routes/access-management/authentication/identity-providers/idpTypePresets'

const defaultStyle: React.CSSProperties = { marginRight: 'var(--pf-t--global--spacer--sm)' }

type ProviderIconKey = 'microsoft' | 'ansible' | null

const IDP_TYPE_TO_ICON: Record<string, ProviderIconKey> = {
  [IdpTypeKey.MICROSOFT_ENTRA]: 'microsoft',
  [IdpTypeKey.AAP]: 'ansible',
}

/** Returns the icon key from the provider template, falling back to name matching. */
function getProviderIconKey(name: string, idpType?: string | null): ProviderIconKey {
  if (idpType && idpType in IDP_TYPE_TO_ICON) return IDP_TYPE_TO_ICON[idpType]
  const lower = name.toLowerCase()
  if (lower.includes('azure') || lower.includes('microsoft') || lower.includes('entra')) return 'microsoft'
  if (lower.includes('ansible') || lower.includes('aap')) return 'ansible'
  return null
}

type ProviderIconProps = {
  name: string
  idpType?: string | null
  style?: React.CSSProperties
}

export function ProviderIcon({ name, idpType, style }: Readonly<ProviderIconProps>) {
  const key = getProviderIconKey(name, idpType)
  const iconStyle = style ?? defaultStyle

  switch (key) {
    case 'microsoft':
      return <MicrosoftIcon style={iconStyle} />
    case 'ansible':
      return <AnsibleTowerIcon style={iconStyle} />
    case null:
      return <GlobeIcon style={iconStyle} />
  }
}
