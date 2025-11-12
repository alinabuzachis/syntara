import type { Tool } from '@ansible/nexus-contracts'
import { Button, ConfirmDialog, EmptyStateNoData, Form, useAlerts } from '@ansible/nexus-ui-framework'
import { RefreshCwIcon } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useParams } from 'wouter'
import { AppPage } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { AppRoute } from '../../../app/AppRoute.tsx'
import { toolProvidersClient, toolsClient } from '../../../client'
import { ChatInput } from '../../../components/chat/ChatInput'
import { useQueryState } from '../../../components/states/useQueryState'
import { StringCell } from '../../../components/table/StringCell'
import { Table } from '../../../components/table/Table'
import { useFuse } from '../../../hooks/useFuse'

export default function IntegrationTools() {
  const params = useParams()
  const [, navigate] = useLocation()
  const provider_id = params?.provider_id || ''
  const { showAlert } = useAlerts()
  const [cursor, setCursor] = useState<string | null>(null)

  const integrationQuery = toolProvidersClient.useQuery('get', '/tool-providers/{provider_id}', {
    params: { path: { provider_id } },
  })
  const provider = integrationQuery.data!
  const integrationQueryStatus = useQueryState(integrationQuery, 'Error loading tools')
  const query = toolsClient.useQuery('get', '/tools', {
    params: {
      query: {
        provider_id: provider_id,
        cursor: cursor ?? undefined,
        limit: 50,
        include_total: true,
      },
    },
  })
  const { mutate: updateTools } = toolsClient.useMutation('patch', '/tools/bulk-update')
  const { mutate: refreshTools } = toolProvidersClient.useMutation(
    'post',
    '/tool-providers/{provider_id}/refresh-tools'
  )

  const handleRefreshTools = () => {
    refreshTools(
      { params: { path: { provider_id } } },
      {
        onSuccess: () => {
          showAlert({
            title: 'Tools refreshed',
            description: `Tools for "${provider.name}" have been refreshed successfully.`,
            variant: 'success',
            autoDismiss: true,
          })
          query.refetch()
        },
        onError: (error) => {
          showAlert({
            title: 'Refresh failed',
            description: `Failed to refresh tools for "${provider.name}": ${error.message}`,
            variant: 'error',
            autoDismiss: true,
          })
        },
      }
    )
  }

  const handleSubmit = async () => {
    const enableTools = enabledTools?.map((tool) => tool.id)
    const disableTools = results?.filter((tool) => !enabledTools.includes(tool))?.map((tool) => tool.id)
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
  const { search, setSearch, items: results } = useFuse(query.data?.resources ?? [], [{ name: 'namespaced_name' }])
  const [enabledTools, setEnabledTools] = useState<Tool[]>([])
  const [refreshDialogOpen, setRefreshDialogOpen] = useState(false)

  if (integrationQueryStatus) return integrationQueryStatus

  return (
    <AppPage>
      <AppPageHeader title={`${provider?.name} tools`}>
        <div className="grow" />
        <input
          className="search grow"
          placeholder="Search tools..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button variant="secondary" onClick={() => setRefreshDialogOpen(true)}>
          Refresh tools
        </Button>
        <Button type="submit" form="tools-form">
          Save
        </Button>
        <Button variant="secondary" onClick={() => navigate(AppRoute.Configuration.Integrations.Root)}>
          Cancel
        </Button>
      </AppPageHeader>
      <Form
        id="tools-form"
        onSubmit={() => {
          //e.preventDefault()
          handleSubmit()
        }}
        className="flex grow flex-col overflow-hidden"
      >
        <Table
          items={results}
          showSelect
          isSelected={(item) => item.enabled}
          keyFn={(item) => item.id}
          itemLabel="tool"
          itemLabelPlural="tools"
          selectedLabel="enabled"
          pagination={{
            next: query.data?.next,
            prev: query.data?.prev,
            total: query.data?.total,
          }}
          onPageChange={(newCursor) => {
            setCursor(newCursor)
          }}
          columns={[
            {
              id: 'name',
              label: 'Name',
              render: (item) => (
                <div>
                  <StringCell>
                    <div>{item.namespaced_name}</div>
                    <div className="text-xs font-thin">{item.description}</div>
                  </StringCell>
                </div>
              ),
            },
          ]}
          emptyState={
            <EmptyStateNoData
              title="No tools available"
              description={`No tools found for "${provider?.name}". Click the button below to refresh and fetch the latest tools from this integration.`}
              buttonText="Refresh tools"
              icon={RefreshCwIcon}
              addData={handleRefreshTools}
            />
          }
          onSelectionChange={(selected) => {
            setEnabledTools(selected)
            console.log(`${selected.length} tools enabled`)
          }}
        />
      </Form>
      <ChatInput />
      <ConfirmDialog
        open={refreshDialogOpen}
        onOpenChange={setRefreshDialogOpen}
        title="Refresh tools"
        description={`Are you sure you want to refresh tools for "${provider?.name}"? This will fetch the latest tools from the integration.`}
        confirmLabel="Refresh"
        onConfirm={handleRefreshTools}
      />
    </AppPage>
  )
}
