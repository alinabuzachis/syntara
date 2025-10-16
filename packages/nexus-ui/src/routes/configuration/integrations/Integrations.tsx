import {
  Menu,
  MenuGroup,
  MenuItems,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
  Scrollable,
} from '@ansible/nexus-ui-framework'
import Fuse from 'fuse.js'
import { EllipsisVerticalIcon } from 'lucide-react'
import { useState } from 'react'
import { useLocation } from 'wouter'
import { AppPage } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { AppRoute } from '../../../app/AppRoute'
import { toolProvidersClient } from '../../../client'
import { ChatInput } from '../../../components/chat/ChatInput'
import { useQueryState } from '../../../components/states/useQueryState'
import { Table } from '../../../components/table/Table'
import { IntegrationCard } from './IntegrationCard'

export default function Integrations() {
  const [, navigate] = useLocation()
  const [search, setSearch] = useState('')

  const query = toolProvidersClient.useQuery('get', '/tool-providers', {})
  const integrations = query.data?.providers ?? []

  const fuse = new Fuse(integrations, {
    keys: [
      { name: 'name', weight: 0.5 },
      { name: 'type', weight: 0.3 },
      { name: 'description', weight: 0.2 },
    ],
    threshold: 0.7,
  })
  const results = search ? fuse.search(search).map((result) => result.item) : integrations
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
        <div className="flex grow flex-col overflow-hidden rounded-4xl border-2 border-violet-300/20">
          <Table
            items={results}
            columns={[
              {
                id: 'name',
                label: 'Name',
                render: (item) => item.name,
              },
              {
                id: 'provider_type',
                label: 'Type',
                render: (item) => item.provider_type || '-',
              },
              {
                id: 'description',
                label: 'Description',
                render: (item) => item.description || '-',
              },
            ]}
          />
        </div>
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
