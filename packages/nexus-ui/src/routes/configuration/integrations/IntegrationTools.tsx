import { useParams } from 'wouter'
import { AppPage } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { useQueryState } from '../../../components/states/useQueryState'
import { toolProvidersClient, toolsClient } from '../../../client.tsx'
import { Button } from '@ansible/nexus-ui-framework'
import { navigate } from 'wouter/use-browser-location'
import { AppRoute } from '../../../app/AppRoute.tsx'
import IntegrationToolsEdit from './IntegrationToolsEdit.tsx'
import type { Tool } from '@ansible/nexus-contracts'

export default function IntegrationTools() {
  const params = useParams()
  const provider_id = params?.provider_id || ''
  const integrationQuery = toolProvidersClient.useQuery('get', '/tool-providers/{provider_id}', {
    params: { path: { provider_id } },
  })
  const provider = integrationQuery.data!
  const { mutate: updateTools } = toolsClient.useMutation('patch', '/tools/bulk-update')
  const integrationQueryStatus = useQueryState(integrationQuery, 'Error loading integration')
  const { data, isLoading, isFetching } = toolsClient.useQuery('get', '/tools', {
    params: {
      query: {
        provider_id: provider_id,
      },
    },
  })
  const tools: Tool[] | undefined = data?.resources

  if (integrationQueryStatus) return integrationQueryStatus

  const handleSubmit = async (toolData: Tool[]) => {
    const enableTools = toolData?.filter((tool) => tool.enabled)?.map((tool) => tool.id)
    const disableTools = toolData?.filter((tool) => !tool.enabled)?.map((tool) => tool.id)
    if (enableTools && enableTools?.length > 0) {
      updateTools(
        { body: { tool_ids: enableTools, enabled: true } },
        { onSuccess: () => navigate(AppRoute.Configuration.Integrations.Root) }
      )
    }
    if (disableTools && disableTools?.length > 0) {
      updateTools(
        { body: { tool_ids: disableTools, enabled: false } },
        { onSuccess: () => navigate(AppRoute.Configuration.Integrations.Root) }
      )
    }
    navigate(AppRoute.Configuration.Integrations.Root)
  }
  return (
    <AppPage>
      <AppPageHeader title={`${provider?.name} tools`}>
        <div className="grow" />
        <Button type="submit" form="tools-form">
          Save
        </Button>
        <Button variant="secondary" onClick={() => navigate(AppRoute.Configuration.Integrations.Root)}>
          Cancel
        </Button>
      </AppPageHeader>
      <div className="relative flex grow gap-4 overflow-hidden">
        <div className="relative isolate flex grow gap-4 overflow-hidden">
          <div className="glass absolute inset-0 rounded-4xl border-2"></div>
          {!isFetching && !isLoading && <IntegrationToolsEdit toolList={tools} handleSubmit={handleSubmit} />}
        </div>
      </div>
    </AppPage>
  )
}
