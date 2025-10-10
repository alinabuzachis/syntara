import { Menu, MenuItem, MenuItems, MenuTrigger } from '@ansible/nexus-ui-framework'
import { EllipsisVerticalIcon } from 'lucide-react'

export function IntegrationCard(props: {
  name: string
  type: string
  description?: string
  status?: 'connected' | 'disconnected'
  url?: string
}) {
  return (
    <div className="glass flex flex-col gap-4 rounded-2xl border p-8">
      <div>
        <div className="flex items-center justify-between">
          <div className="text-lg font-bold">{props.name}</div>
          <Menu>
            <MenuTrigger>
              <EllipsisVerticalIcon />
            </MenuTrigger>
            <MenuItems>
              <MenuItem>Hello</MenuItem>
            </MenuItems>
          </Menu>
        </div>
        {props.type && (
          <div id="type" className="text-sm text-white/50">
            {props.type}
          </div>
        )}
        <div id="description" className="mt-4 text-white/70">
          {props.description}
        </div>
      </div>

      <dl className="details">
        <dt>Status</dt>
        <dd>
          {props.status === 'connected' ? (
            <div className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-green-400" />
          ) : (
            <div className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-red-400" />
          )}
          {props.status === 'connected' ? 'Connected' : 'Disconnected'}
        </dd>
        {props.url && (
          <>
            <dt>URL</dt>
            <dd>{props.url}</dd>
          </>
        )}
      </dl>
    </div>
  )
}
