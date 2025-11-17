import { EmptyStateNoData } from '@ansible/nexus-ui-framework'
import { navigate } from 'wouter/use-browser-location'

import { AppRoute } from '../../../app/AppRoute.tsx'

export function IntegrationEmptyState() {
  return (
    <EmptyStateNoData
      title="No integrations have been configured yet."
      description="Configure integrations to use them in automation. Integrations will allow for monitoring of server health and performance metrics, view server logs, and manage server settings and configurations."
      buttonText="Add Integration"
      addData={() => navigate(AppRoute.Configuration.Integrations.Configure)}
    />
  )
}
