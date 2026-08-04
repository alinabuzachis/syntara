import { FormHelperText, HelperText, HelperTextItem } from '@patternfly/react-core'

import { AppRoute } from '../../../app/AppRoute'
import { NxLink } from '../../../components/NxLink'
import { useIntegrationPermissions } from '../../configuration/integrations/useIntegrationPermissions'

export type IntegrationRequiredHelperProps = Readonly<{
  integrationLabel: string
  actionLabel: string
}>

export function IntegrationRequiredHelper({ integrationLabel, actionLabel }: IntegrationRequiredHelperProps) {
  const { canCreate } = useIntegrationPermissions()

  return (
    <FormHelperText>
      <HelperText>
        <HelperTextItem>
          An administrator must{' '}
          {canCreate ? (
            <NxLink to={AppRoute.Configuration.Integrations.Configure}>configure {integrationLabel}</NxLink>
          ) : (
            `configure ${integrationLabel}`
          )}{' '}
          before {actionLabel}.
        </HelperTextItem>
      </HelperText>
    </FormHelperText>
  )
}
