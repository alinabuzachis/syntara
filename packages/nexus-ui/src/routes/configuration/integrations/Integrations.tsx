import {
  Menu,
  MenuGroup,
  MenuItems,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
  Scrollable,
} from '@ansible/nexus-ui-framework'
import { EllipsisVerticalIcon, EyeIcon, Trash2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import { AppPage } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { AppRoute } from '../../../app/AppRoute'
import { toolProvidersClient } from '../../../client'
import { ChatInput } from '../../../components/chat/ChatInput'
import { useQueryState } from '../../../components/states/useQueryState'
import { StringCell } from '../../../components/table/StringCell'
import { Table, type IRowAction } from '../../../components/table/Table'
import { useFuse } from '../../../hooks/useFuse'
import { IntegrationCard } from './IntegrationCard'
import { IntegrationEmptyState } from './IntegrationEmptyState.tsx'
import type { ToolProvider } from '@ansible/nexus-contracts'

export default function Integrations() {
  const [, navigate] = useLocation()
  const query = toolProvidersClient.useQuery('get', '/tool-providers', {})
  const { search, setSearch, items: results } = useFuse(query.data?.resources ?? [], [{ name: 'name' }])

  const rowActions = useMemo<IRowAction<ToolProvider>[]>(
    () => [
      {
        label: 'View and enable/disable tools',
        icon: EyeIcon,
        onClick: (provider: ToolProvider) => {
          navigate(`/configuration/integrations/${provider.id}/tools`)
        },
      },
      {
        label: 'Uninstall',
        icon: Trash2Icon,
        variant: 'destructive' as const,
        onClick: (provider: ToolProvider) => {
          if (confirm(`Are you sure you want to delete "${provider.name}"?`)) {
            console.log('Uninstall integration:', provider.name)
          }
        },
      },
    ],
    [navigate]
  )

  const [view, setView] = useState<'table' | 'cards'>('table')

  const queryState = useQueryState(query, 'Error loading integrations')
  if (queryState) return queryState

  return (
    <AppPage>
      {results && results.length > 0 && (
        <AppPageHeader title="Integrations">
          {/* <ExampleToggleGroup /> */}
          <input
            className="search grow"
            placeholder="Search integrations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="rounded-full bg-blue-400/70 px-4 py-1"
            onClick={() => navigate(AppRoute.Configuration.Integrations.Configure)}
          >
            Add Integration
          </button>
          <Menu>
            <MenuTrigger>
              <EllipsisVerticalIcon />
            </MenuTrigger>
            <MenuItems>
              <MenuGroup label="View">
                <MenuRadioGroup value={view} onValueChange={setView}>
                  <MenuRadioItem value="table">Table</MenuRadioItem>
                  <MenuRadioItem value="cards">Cards</MenuRadioItem>
                </MenuRadioGroup>
              </MenuGroup>
            </MenuItems>
          </Menu>
          {/* <ExampleToggleGroup /> */}
        </AppPageHeader>
      )}
      {view !== 'cards' ? (
        <Table
          items={results}
          rowActions={rowActions}
          keyFn={(item) => item.id}
          columns={[
            {
              id: 'name',
              label: 'Name',
              render: (item) => <StringCell>{item.name}</StringCell>,
            },
            {
              id: 'status',
              label: 'Status',
              render: (item) => <StringCell>{item.status}</StringCell>,
            },
            {
              id: 'configuration',
              label: 'Integration type',
              render: (item) => <StringCell>{item.configuration.provider_type}</StringCell>,
            },
            {
              id: 'tool_count',
              label: 'Tools',
              render: (item) => <StringCell>{item.tool_count}</StringCell>,
            },
          ]}
          emptyState=<IntegrationEmptyState />
        />
      ) : (
        <Scrollable className="glass grow rounded-4xl border">
          <div className={`grid grid-cols-[repeat(auto-fit,minmax(350px,1fr))] gap-4 p-8`}>
            {results.map((integration) => (
              <IntegrationCard key={integration.id} integration={integration} />
            ))}
          </div>
        </Scrollable>
      )}
      <ChatInput />
    </AppPage>
  )
}
