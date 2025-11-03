import {
  Checkbox,
  Menu,
  MenuItem,
  MenuItems,
  MenuSeparator,
  MenuTrigger,
  Scrollable,
} from '@ansible/nexus-ui-framework'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Column } from './Column'
import type { LucideIcon } from 'lucide-react'
import { EllipsisVerticalIcon } from 'lucide-react'

export interface IRowAction<T> {
  label: string
  onClick: (item: T) => unknown
  icon?: LucideIcon
  variant?: 'default' | 'destructive'
  disabled?: boolean | ((item: T) => boolean)
  separator?: boolean // Add separator before this action
}

export interface IBulkAction<T> {
  label: string
  onClick: (items: T[]) => unknown
  icon?: LucideIcon
  variant?: 'default' | 'destructive'
}

export function Table<T>(props: {
  items: T[]
  columns: Column<T>[]
  rowActions?: IRowAction<T>[]
  bulkActions?: IBulkAction<T>[]
  emptyState?: ReactNode
  keyFn?: (item: T) => string | number
  showSelect?: boolean
  isSelected?: (item: T) => boolean
  onSelectionChange?: (selectedItems: T[]) => void
}) {
  const { items, columns, bulkActions, keyFn, isSelected, onSelectionChange, showSelect } = props
  const [atTop, setAtTop] = useState<boolean | undefined>(true)
  const [atBottom, setAtBottom] = useState<boolean | undefined>(true)

  // Generate unique keys for items
  const getItemKey = useCallback(
    (item: T, index: number): string | number => {
      return keyFn ? keyFn(item) : index
    },
    [keyFn]
  )

  // Track whether user has manually changed selection
  const [userModifiedSelection, setUserModifiedSelection] = useState(false)
  const [manualSelection, setManualSelection] = useState<Set<string | number>>(new Set())

  // Derive initial selection from isSelected prop
  const derivedSelection = useMemo(() => {
    if (!isSelected) return new Set<string | number>()
    const initialSelection = new Set<string | number>()
    items.forEach((item, index) => {
      if (isSelected(item)) {
        initialSelection.add(getItemKey(item, index))
      }
    })
    return initialSelection
  }, [items, isSelected, getItemKey])

  // Use manual selection if user has modified, otherwise use derived
  const selectedItems = userModifiedSelection ? manualSelection : derivedSelection

  // Check if all items are selected
  const allSelected = items.length > 0 && selectedItems.size === items.length

  const someSelected = selectedItems.size > 0 && selectedItems.size < items.length

  // Toggle all items selection
  const toggleAll = () => {
    setUserModifiedSelection(true)
    if (allSelected) {
      setManualSelection(new Set())
    } else {
      setManualSelection(new Set(items.map((item, index) => getItemKey(item, index))))
    }
  }

  // Toggle single item selection
  const toggleItem = (key: string | number) => {
    setUserModifiedSelection(true)
    const newSelection = new Set(selectedItems)
    if (newSelection.has(key)) {
      newSelection.delete(key)
    } else {
      newSelection.add(key)
    }
    setManualSelection(newSelection)
  }

  // Get selected item objects
  const selectedItemObjects = useMemo(() => {
    return items.filter((item, index) => selectedItems.has(getItemKey(item, index)))
  }, [items, selectedItems, getItemKey])

  // Notify parent component when selection changes
  useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange(selectedItemObjects)
    }
  }, [selectedItemObjects, onSelectionChange])

  // Show bulk actions toolbar
  const showBulkActions = showSelect || (bulkActions && bulkActions.length > 0)
  if (!props?.items || (props?.items?.length < 1 && props.emptyState)) {
    return props.emptyState
  }
  return (
    <div className="flex grow flex-col overflow-hidden rounded-4xl border-2 border-white/20">
      {/* Bulk Actions Toolbar */}
      {showBulkActions && selectedItems.size > 0 && (
        <div className="glass sticky top-0 z-20 border-b border-violet-300/20 bg-violet-600/20 px-8 py-3">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">
              {selectedItems.size} {selectedItems.size === 1 ? 'item' : 'items'} selected
            </span>
            {bulkActions && bulkActions.length > 0 && (
              <div className="flex gap-2">
                {bulkActions.map((action, index) => {
                  const Icon = action.icon
                  return (
                    <button
                      key={index}
                      className={clsx(
                        'flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm transition-colors',
                        action.variant === 'destructive'
                          ? 'bg-red-500/70 hover:bg-red-500/90'
                          : 'bg-violet-500/70 hover:bg-violet-500/90'
                      )}
                      onClick={() => {
                        action.onClick(selectedItemObjects)
                        setUserModifiedSelection(true)
                        setManualSelection(new Set()) // Clear selection after action
                      }}
                    >
                      {Icon && <Icon className="size-4" />}
                      {action.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
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
              {showBulkActions && (
                <th className="w-12">
                  <Checkbox checked={allSelected} indeterminate={someSelected} onCheckedChange={toggleAll} />
                </th>
              )}
              {columns.map((column) => (
                <th key={String(column.id)} style={column.width ? { width: column.width } : undefined}>
                  {column.label}
                </th>
              ))}
              {props?.rowActions && props.rowActions.length > 0 && <th />}
            </tr>
          </thead>
          <tbody className="glass">
            {items.map((item, index) => {
              const itemKey = getItemKey(item, index)
              const isSelected = selectedItems.has(itemKey)
              return (
                <tr
                  key={itemKey}
                  className={clsx('text-left *:h-12 *:border-b *:border-violet-300/20 *:px-8', {
                    'bg-violet-500/10': isSelected,
                  })}
                >
                  {showBulkActions && (
                    <td>
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleItem(itemKey)} />
                    </td>
                  )}
                  {columns.map((column) => (
                    <td key={String(column.id)} style={column.width ? { width: column.width } : undefined}>
                      {column.render(item)}
                    </td>
                  ))}
                  {props?.rowActions && props.rowActions.length > 0 && (
                    <td>
                      <Menu>
                        <MenuTrigger className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/10">
                          <EllipsisVerticalIcon className="size-4" />
                        </MenuTrigger>
                        <MenuItems>
                          {props?.rowActions?.map((action, actionIndex) => {
                            const Icon = action.icon
                            const isDisabled =
                              typeof action.disabled === 'function' ? action.disabled(item) : action.disabled
                            return (
                              <>
                                {action.separator && actionIndex > 0 && <MenuSeparator />}
                                <MenuItem
                                  key={actionIndex}
                                  onClick={() => !isDisabled && action.onClick(item)}
                                  disabled={isDisabled}
                                  className={clsx(
                                    'flex items-center gap-2',
                                    action.variant === 'destructive' && 'text-red-400 hover:bg-red-500/20',
                                    isDisabled && 'cursor-not-allowed opacity-50'
                                  )}
                                >
                                  {Icon && <Icon className="size-4" />}
                                  {action.label}
                                </MenuItem>
                              </>
                            )
                          })}
                        </MenuItems>
                      </Menu>
                    </td>
                  )}
                </tr>
              )
            })}
            <tr>
              <td colSpan={columns.length + (showBulkActions ? 2 : 1)} />
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
        <div className="flex h-full items-center bg-white/5 px-8">
          {selectedItems.size > 0 ? (
            <>
              {selectedItems.size} of {items.length} items selected
            </>
          ) : (
            <>{items.length} items</>
          )}
        </div>
      </div>
    </div>
  )
}
