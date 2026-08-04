import { useNavigate } from '@tanstack/react-router'

import { AppRoute } from '../../../app/AppRoute'
import { NxEmptyStateNoData } from '../../../components/states/NxEmptyStateNoData'
import { detachPromise } from '../../../utils/detachPromise'

export function IntegrationEmptyState({ canCreate = true }: Readonly<{ canCreate?: boolean }>) {
  const navigate = useNavigate()
  return (
    <NxEmptyStateNoData
      title="No integrations have been configured yet."
      description="Configure integrations to use them in workflows. Integrations will allow for monitoring of server health and performance metrics, view server logs, and manage server settings and configurations."
      buttonText={canCreate ? 'Configure integration' : undefined}
      addData={
        canCreate ? () => detachPromise(navigate({ to: AppRoute.Configuration.Integrations.Configure })) : undefined
      }
    />
  )
}
