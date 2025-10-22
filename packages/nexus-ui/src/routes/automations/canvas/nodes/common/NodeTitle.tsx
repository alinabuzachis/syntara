import clsx from 'clsx'
import { ChevronDownIcon, MoreVerticalIcon } from 'lucide-react'
import { useContext } from 'react'
import { NodeExpandedContext } from './NodeExpandedContext'

export function NodeTitle(props: { name?: string; type: string; icon?: React.ReactNode; disableExpand?: boolean }) {
  const [expanded, setExpanded] = useContext(NodeExpandedContext)
  return (
    <div className="flex gap-2">
      <div className="pt-1">{props.icon}</div>
      {props.name ? (
        <div className="grow">
          <label className="text-lg font-bold">{props.name}</label>
          <div className="text-xs text-white/60">{props.type}</div>
        </div>
      ) : (
        <div className="grow text-lg font-bold">{props.type}</div>
      )}
      <div className="flex gap-2 pt-1 pl-8">
        {!props.disableExpand && (
          <ChevronDownIcon
            onClick={() => setExpanded((expanded) => !expanded)}
            className={clsx('transition-all ease-out', {
              'rotate-180': expanded,
            })}
          />
        )}
        <MoreVerticalIcon />
        {/* <Menu>
          <MenuTrigger>
            <EllipsisVerticalIcon />
          </MenuTrigger>
          <MenuItems>
            <MenuItem>Start Server</MenuItem>
            <MenuItem>Stop Server</MenuItem>
            <MenuItem>Remove Server</MenuItem>
          </MenuItems>
        </Menu> */}
      </div>
    </div>
  )
}
