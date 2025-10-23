import {
  Menu,
  MenuGroup,
  MenuItems,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
  Scrollable,
} from '@ansible/nexus-ui-framework'
import { EllipsisVerticalIcon } from 'lucide-react'
import { useState } from 'react'
import { useLocation } from 'wouter'
import { AppPage } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { AppRoute } from '../../../app/AppRoute'
import { toolProvidersClient } from '../../../client'
import { ChatInput } from '../../../components/chat/ChatInput'
import { useQueryState } from '../../../components/states/useQueryState'
import { StringCell } from '../../../components/table/StringCell'
import { Table } from '../../../components/table/Table'
import { useFuse } from '../../../hooks/useFuse'
import { IntegrationCard } from './IntegrationCard'

export default function Integrations() {
  const [, navigate] = useLocation()
  const query = toolProvidersClient.useQuery('get', '/tool-providers', {})
  const { search, setSearch, items: providers } = useFuse(query.data?.providers ?? [], [{ name: 'name' }])
  const [view, setView] = useState<'table' | 'cards'>('table')

  const queryState = useQueryState(query, 'Error loading integrations')
  if (queryState) return queryState

  return (
    <AppPage>
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
      {view !== 'cards' ? (
        // <div className="roundedgrow overflow-hidden flex flex-col">
        <Table
          items={providers}
          columns={[
            {
              id: 'name',
              label: 'Name',
              render: (item) => <StringCell>{item.name}</StringCell>,
            },
            {
              id: 'provider_type',
              label: 'Type',
              render: (item) => <StringCell>{item.provider_type}</StringCell>,
            },
            {
              id: 'description',
              label: 'Description',
              render: (item) => <StringCell>{item.description}</StringCell>,
            },
          ]}
        />
      ) : (
        <Scrollable className="glass grow rounded-4xl border">
          <div className={`grid grid-cols-[repeat(auto-fit,minmax(350px,1fr))] gap-4 p-8`}>
            {providers.map((integration) => (
              <IntegrationCard key={integration.id} integration={integration} />
            ))}
          </div>
        </Scrollable>
      )}
      <ChatInput />
    </AppPage>
  )
}
