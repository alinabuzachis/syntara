import type { Tool } from '@ansible/nexus-contracts'
import { Button, Form } from '@ansible/nexus-ui-framework'
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
import { IntegrationEmptyState } from './IntegrationEmptyState.tsx'

export default function IntegrationTools() {
  const params = useParams()
  const [, navigate] = useLocation()
  const provider_id = params?.provider_id || ''
  const integrationQuery = toolProvidersClient.useQuery('get', '/tool-providers/{provider_id}', {
    params: { path: { provider_id } },
  })
  const provider = integrationQuery.data!
  //const { mutate: updateTools} = toolsClient.useMutation('patch', '/tools/bulk-update')
  const integrationQueryStatus = useQueryState(integrationQuery, 'Error loading tools')
  const query = toolsClient.useQuery('get', '/tools', {
    params: {
      query: {
        provider_id: provider_id,
      },
    },
  })
  const { mutate: updateTools } = toolsClient.useMutation('patch', '/tools/bulk-update')

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
          emptyState={<IntegrationEmptyState />}
          onSelectionChange={(selected) => {
            setEnabledTools(selected)
            console.log(`${selected.length} tools enabled`)
          }}
        />
      </Form>
      <ChatInput />
    </AppPage>
  )
}
