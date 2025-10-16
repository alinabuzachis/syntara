import { Scrollable } from '@ansible/nexus-ui-framework'
import clsx from 'clsx'
import type { Column } from './Column'

export function Table<T>(props: { items: T[]; columns: Column<T>[] }) {
  const { items, columns } = props
  return (
    <Scrollable className="grow">
      <table className="h-full w-full border-separate border-spacing-0">
        <thead
          className={clsx('glass sticky top-0 z-10', {
            'shadow-lg shadow-black/50': false,
          })}
        >
          <tr className="bg-white/5 text-left *:h-16 *:border-b *:border-violet-300/20 *:px-8">
            {columns.map((column) => (
              <th key={String(column.id)}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="glass">
          {items.map((item, index) => (
            <tr key={index} className="text-left *:h-12 *:border-b *:border-violet-300/20 *:px-8">
              {columns.map((column) => (
                <td key={String(column.id)}>{column.render(item)}</td>
              ))}
            </tr>
          ))}
          <tr>
            <td colSpan={columns.length} />
          </tr>
        </tbody>
        <tfoot className="glass sticky bottom-0 z-10 h-16 min-h-12">
          <tr className="bg-white/5">
            <td colSpan={columns.length} className="border-t border-violet-300/20 px-6">
              {items.length} items
            </td>
          </tr>
        </tfoot>
      </table>
    </Scrollable>
  )
}
