import { AppRoute } from '../../../app/AppRoute.tsx'
import noDataImage from '../../../assets/collage-circle-sparkles-window-server-dark-RH.png'
import { NxEmptyStateNoData } from '../../../components/states/NxEmptyStateNoData'
import { navigate } from '../../../hooks/routing/navigate'

export function IntegrationEmptyState() {
  return (
    <NxEmptyStateNoData
      imageSrc={noDataImage}
      imageAlt="No integrations configured"
      title="No integrations have been configured yet."
      description="Configure integrations to use them in workflows. Integrations will allow for monitoring of server health and performance metrics, view server logs, and manage server settings and configurations."
      buttonText="Configure integration"
      addData={() => navigate(AppRoute.Configuration.Integrations.Configure)}
    />
  )
}
