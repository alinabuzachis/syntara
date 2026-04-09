import { Button, Stack, StackItem } from '@patternfly/react-core'
import { AnsibleTowerIcon, GoogleIcon, MicrosoftIcon, RedhatIcon } from '@patternfly/react-icons'

import type { AuthProvider } from './useAuthProviders'

const iconStyle: React.CSSProperties = { marginRight: 'var(--pf-t--global--spacer--sm)' }

/**
 * Best-effort icon matching for known OIDC providers.
 *
 * The API currently only exposes `provider_type` ("oidc") — not a brand identifier.
 * Until a `brand` or `icon_key` field is added to the API, we match on the
 * admin-chosen provider name. These are internal identifiers set by administrators,
 * not user-facing translated strings, so this is acceptable per i18n guidelines.
 */
function getProviderIconKey(name: string): 'microsoft' | 'google' | 'redhat' | 'ansible' | null {
  const lower = name.toLowerCase()
  if (lower.includes('azure') || lower.includes('microsoft') || lower.includes('entra')) return 'microsoft'
  if (lower.includes('google')) return 'google'
  if (lower.includes('red hat') || lower.includes('redhat')) return 'redhat'
  if (lower.includes('ansible') || lower.includes('aap')) return 'ansible'
  return null
}

function ProviderIcon({ name }: Readonly<{ name: string }>) {
  const key = getProviderIconKey(name)

  switch (key) {
    case 'microsoft':
      return <MicrosoftIcon style={iconStyle} />
    case 'google':
      return <GoogleIcon style={iconStyle} />
    case 'redhat':
      return <RedhatIcon style={iconStyle} />
    case 'ansible':
      return <AnsibleTowerIcon style={iconStyle} />
    case null:
      return <span style={{ fontWeight: 700, ...iconStyle }}>{name.charAt(0).toUpperCase()}</span>
  }
}

interface IdentityProviderButtonsProps {
  providers: AuthProvider[]
}

export function IdentityProviderButtons({ providers }: Readonly<IdentityProviderButtonsProps>) {
  const handleClick = (providerId: string) => {
    globalThis.location.assign(`/api/v1/auth/oidc/authorize?provider_id=${encodeURIComponent(providerId)}`)
  }

  return (
    <Stack hasGutter>
      {providers.map((provider) => (
        <StackItem key={provider.id}>
          <Button
            variant="primary"
            isBlock
            onClick={() => handleClick(provider.id)}
            aria-label={`Log in with ${provider.name}`}
          >
            <ProviderIcon name={provider.name} />
            Log in with {provider.name}
          </Button>
        </StackItem>
      ))}
    </Stack>
  )
}
