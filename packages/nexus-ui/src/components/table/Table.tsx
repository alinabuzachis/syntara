import { Menu, MenuItem, MenuItems, MenuTrigger, Scrollable } from '@ansible/nexus-ui-framework'
import clsx from 'clsx'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Column } from './Column'
import { EllipsisIcon } from 'lucide-react'

export interface IRowAction<T> {
  label: string
  onClick: (item: T) => unknown
}

export function Table<T>(props: {
  items: T[]
  columns: Column<T>[]
  rowActions?: IRowAction<T>[]
  emptyState?: ReactNode
}) {
  const { items, columns } = props
  const [atTop, setAtTop] = useState<boolean | undefined>(true)
  const [atBottom, setAtBottom] = useState<boolean | undefined>(true)
  if (!props?.items || (props?.items?.length < 1 && props.emptyState)) {
    return props.emptyState
  }
  return (
    <div className="flex grow flex-col overflow-hidden rounded-4xl border-2 border-white/20">
      <Scrollable
        className="grow"
        onScroll={({ atTop, atBottom }) => {
          setAtTop(atTop)
          setAtBottom(atBottom)
        }}
      >
        <table className="h-full w-full border-separate border-spacing-0">
          <thead
            className={clsx('glass sticky top-0 z-10', {
              'shadow-lg shadow-black/50': !atTop,
            })}
          >
            <tr className="bg-white/5 text-left *:h-16 *:border-b *:border-violet-300/20 *:px-8">
              {columns.map((column) => (
                <th key={String(column.id)}>{column.label}</th>
              ))}
              {props?.rowActions && props.rowActions.length > 0 && <th />}
            </tr>
          </thead>
          <tbody className="glass">
            {items.map((item, index) => (
              <tr key={index} className="text-left *:h-12 *:border-b *:border-violet-300/20 *:px-8">
                {columns.map((column) => (
                  <td key={String(column.id)}>{column.render(item)}</td>
                ))}
                {props?.rowActions && props.rowActions.length > 0 && (
                  <td>
                    <Menu>
                      <MenuTrigger>
                        <EllipsisIcon />
                      </MenuTrigger>
                      <MenuItems>
                        {props?.rowActions?.map((action) => (
                          <MenuItem onClick={() => action.onClick(item)}> {action.label}</MenuItem>
                        ))}
                      </MenuItems>
                    </Menu>
                  </td>
                )}
              </tr>
            ))}
            <tr>
              <td colSpan={columns.length + 1} />
            </tr>
          </tbody>
        </table>
        <div
          className={clsx(
            'pointer-events-none sticky bottom-0 -mt-4 h-4 bg-linear-to-t from-black/50 to-black/0 opacity-0 transition-opacity',
            { 'opacity-100': !atBottom }
          )}
        ></div>
      </Scrollable>
      <div className="glass sticky bottom-0 z-10 h-16 min-h-12 border-t">
        <div className="flex h-full items-center bg-white/5 px-8">{items.length} items</div>
      </div>
    </div>
  )
}
