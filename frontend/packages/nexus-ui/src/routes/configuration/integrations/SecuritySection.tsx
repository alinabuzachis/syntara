import { Alert, DescriptionList, StackItem, Title } from '@patternfly/react-core'
import type { IntegrationsAPI } from '@syntara/contracts'

import { NxDetail } from '../../../components/details/NxDetail'

import styles from './IntegrationDetail.module.css'

type IntegrationRead = IntegrationsAPI.components['schemas']['IntegrationRead']

export function SecuritySection({ configuration }: Readonly<{ configuration: IntegrationRead['configuration'] }>) {
  if (!configuration || !('allow_http' in configuration) || !('insecure_skip_tls_verify' in configuration)) {
    return null
  }

  return (
    <StackItem>
      <Title headingLevel="h2" size="lg">
        Security
      </Title>
      <DescriptionList isHorizontal className={styles.securityDetails}>
        <NxDetail label="HTTP connections">
          {configuration.allow_http ? <Alert variant="warning" isInline isPlain title="HTTP allowed" /> : 'HTTPS only'}
        </NxDetail>
        <NxDetail label="TLS certificate verification">
          {configuration.insecure_skip_tls_verify ? (
            <Alert variant="warning" isInline isPlain title="TLS verification disabled" />
          ) : (
            'Enabled'
          )}
        </NxDetail>
      </DescriptionList>
    </StackItem>
  )
}
