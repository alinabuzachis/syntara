import { Button, Stack, StackItem } from '@patternfly/react-core'

import { OIDC_AUTHORIZE_PATH } from '../client'
import { ProviderIcon } from '../components/ProviderIcon'
import { EXPLICIT_LOGOUT_KEY } from '../components/session/sessionTimeoutConstants'

import type { AuthProvider } from './useAuthProviders'

type IdentityProviderButtonsProps = {
  providers: AuthProvider[]
}

export function IdentityProviderButtons({ providers }: Readonly<IdentityProviderButtonsProps>) {
  const handleClick = (providerId: string) => {
    sessionStorage.removeItem(EXPLICIT_LOGOUT_KEY)
    globalThis.location.assign(`${OIDC_AUTHORIZE_PATH}?provider_id=${encodeURIComponent(providerId)}`)
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
            <ProviderIcon name={provider.name} idpType={provider.provider_template} />
            Log in with {provider.name}
          </Button>
        </StackItem>
      ))}
    </Stack>
  )
}
