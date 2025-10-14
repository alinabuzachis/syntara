import {
  Menu,
  MenuGroup,
  MenuItem,
  MenuItems,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
  Scrollable,
} from '@ansible/nexus-ui-framework'
import clsx from 'clsx'
import Fuse from 'fuse.js'
import { EllipsisVerticalIcon } from 'lucide-react'
import { useState } from 'react'
import { useLocation } from 'wouter'
import { AppPage } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { AppRoute } from '../../../app/AppRoute'
import { toolsClient } from '../../../client'
import { ChatInput } from '../../../components/chat/ChatInput'
import { useQueryState } from '../../../components/states/useQueryState'
import { IntegrationCard } from './IntegrationCard'

export default function Integrations() {
  const [, navigate] = useLocation()
  const [search, setSearch] = useState('')

  const query = toolsClient.useQuery('get', '/tools', {})
  const integrations = query.data?.tools ?? []

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
          <Scrollable className="grow">
            <table className="h-full w-full border-separate border-spacing-0">
              <thead
                className={clsx('glass sticky top-0 z-10', {
                  'shadow-lg shadow-black/50': false,
                })}
              >
                <tr className="bg-white/5 text-left *:h-16 *:border-b *:border-violet-300/20 *:px-8">
                  {/* <th className="w-1 min-w-12 text-center">
                    <input type="checkbox" />
                  </th> */}
                  <th>Name</th>
                  <th>Type</th>
                  <th className="w-1 min-w-12 text-center"></th>
                </tr>
              </thead>
              <tbody className="glass">
                {results.map((integration) => (
                  <tr key={integration.id} className="text-left *:h-12 *:border-b *:border-violet-300/20 *:px-8">
                    {/* <td className="w-1 min-w-12 text-center">
                      <input type="checkbox" />
                    </td> */}
                    <td>{integration.name}</td>
                    {/* <td>{integration.type}</td> */}
                    <td className="w-1 min-w-12 pt-1.5 text-center">
                      <Menu>
                        <MenuTrigger>
                          <EllipsisVerticalIcon />
                        </MenuTrigger>
                        <MenuItems>
                          <MenuItem>Stop server</MenuItem>
                          <MenuItem>Restart server</MenuItem>
                          <MenuSeparator />
                          <MenuItem>View and enable/disable tools</MenuItem>
                          <MenuSeparator />
                          <MenuItem>Show output</MenuItem>
                          <MenuItem>Show configuration</MenuItem>
                          <MenuItem>Show configuration (JSON)</MenuItem>
                          <MenuSeparator />
                          <MenuItem>Configure model access</MenuItem>
                          <MenuItem>Show sampling requests</MenuItem>
                          <MenuSeparator />
                          <MenuItem>Browser resources</MenuItem>
                          <MenuSeparator />
                          <MenuItem>Uninstall</MenuItem>
                        </MenuItems>
                      </Menu>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={4} />
                </tr>
              </tbody>
              <tfoot className="glass sticky bottom-0 z-10 h-16 min-h-12">
                <tr className="bg-white/5">
                  <td colSpan={4} className="border-t border-violet-300/20 px-6">
                    {results.length} integrations
                  </td>
                </tr>
              </tfoot>
            </table>
          </Scrollable>
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
