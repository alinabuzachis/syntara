import type { IntegrationsAPI } from '@ansible/nexus-contracts'

type IntegrationRead = IntegrationsAPI.components['schemas']['IntegrationRead']

export function getBaseUrl(integration: IntegrationRead): string {
  const config = integration.configuration
  if (!config) return ''
  if ('base_url' in config) return String(config.base_url ?? '')
  if ('aap_url' in config) return String(config.aap_url ?? '')
  return ''
}
