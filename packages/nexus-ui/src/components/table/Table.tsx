import { Scrollable } from '@ansible/nexus-ui-framework'
import { Button, Checkbox, Divider, Dropdown, DropdownItem, DropdownList, MenuToggle } from '@patternfly/react-core'
import type { MenuToggleElement } from '@patternfly/react-core'
import { AngleLeftIcon, AngleRightIcon, EllipsisVIcon } from '@patternfly/react-icons'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'

import type { Column } from './Column'

export interface IRowAction<T> {
  label: string
  onClick: (item: T) => unknown
  icon?: React.ComponentType<{ className?: string }>
  variant?: 'default' | 'destructive'
  disabled?: boolean | ((item: T) => boolean)
  separator?: boolean // Add separator before this action
}

export interface IBulkAction<T> {
  label: string
  onClick: (items: T[]) => unknown
  icon?: React.ComponentType<{ className?: string }>
  variant?: 'default' | 'destructive'
}

export interface PaginationInfo {
  next?: string | null
  prev?: string | null
  total?: number | null
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
  pagination?: PaginationInfo
  onPageChange?: (cursor: string | null, direction: 'next' | 'prev') => void
  itemLabel?: string // Custom label for items (e.g., "tool", "integration")
  itemLabelPlural?: string // Custom plural label (e.g., "tools", "integrations")
  selectedLabel?: string // Custom label for selected state (defaults to "selected")
}) {
  const { items, columns, bulkActions, keyFn, isSelected, onSelectionChange, showSelect } = props
  const [atTop, setAtTop] = useState<boolean | undefined>(true)
  const [atBottom, setAtBottom] = useState<boolean | undefined>(true)
  const [openActionMenuId, setOpenActionMenuId] = useState<string | number | null>(null)

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

  // Get item label text
  const getItemLabel = (count: number) => {
    if (count === 1) {
      return props.itemLabel || 'item'
    }
    return props.itemLabelPlural || props.itemLabel ? `${props.itemLabel}s` : 'items'
  }

  // Get selected label text
  const getSelectedLabel = () => {
    return props.selectedLabel || 'selected'
  }

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
              {selectedItems.size} {getItemLabel(selectedItems.size)} {getSelectedLabel()}
            </span>
            {bulkActions && bulkActions.length > 0 && (
              <div className="flex gap-2">
                {bulkActions.map((action) => {
                  const Icon = action.icon
                  return (
                    <Button
                      key={action.label}
                      variant={action.variant === 'destructive' ? 'danger' : 'primary'}
                      size="sm"
                      onClick={() => {
                        action.onClick(selectedItemObjects)
                        setUserModifiedSelection(true)
                        setManualSelection(new Set()) // Clear selection after action
                      }}
                    >
                      {Icon && <Icon className="mr-2 size-4" />}
                      {action.label}
                    </Button>
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
                  <Checkbox
                    id="select-all"
                    isChecked={allSelected ? true : someSelected ? null : false}
                    onChange={toggleAll}
                  />
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
                      <Checkbox id={`select-${itemKey}`} isChecked={isSelected} onChange={() => toggleItem(itemKey)} />
                    </td>
                  )}
                  {columns.map((column) => (
                    <td key={String(column.id)} style={column.width ? { width: column.width } : undefined}>
                      {column.render(item)}
                    </td>
                  ))}
                  {props?.rowActions && props.rowActions.length > 0 && (
                    <td>
                      <Dropdown
                        isOpen={openActionMenuId === itemKey}
                        onOpenChange={(isOpen) => setOpenActionMenuId(isOpen ? itemKey : null)}
                        toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                          <MenuToggle
                            ref={toggleRef}
                            onClick={() => setOpenActionMenuId(openActionMenuId === itemKey ? null : itemKey)}
                            isExpanded={openActionMenuId === itemKey}
                            variant="plain"
                            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-white/10"
                          >
                            <EllipsisVIcon className="size-4" />
                          </MenuToggle>
                        )}
                      >
                        <DropdownList>
                          {props?.rowActions?.map((action, actionIndex) => {
                            const Icon = action.icon
                            const isDisabled =
                              typeof action.disabled === 'function' ? action.disabled(item) : action.disabled
                            return (
                              <Fragment key={action.label}>
                                {action.separator && actionIndex > 0 && <Divider />}
                                <DropdownItem
                                  onClick={() => {
                                    if (!isDisabled) {
                                      action.onClick(item)
                                    }
                                    setOpenActionMenuId(null)
                                  }}
                                  isDisabled={isDisabled}
                                  isDanger={action.variant === 'destructive'}
                                >
                                  <span className="flex items-center gap-2">
                                    {Icon && <Icon className="size-4" />}
                                    {action.label}
                                  </span>
                                </DropdownItem>
                              </Fragment>
                            )
                          })}
                        </DropdownList>
                      </Dropdown>
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
        <div className="flex h-full items-center justify-between bg-white/5 px-8">
          <div>
            {selectedItems.size > 0 ? (
              <>
                {selectedItems.size} of {items.length} {getItemLabel(items.length)} {getSelectedLabel()}
              </>
            ) : (
              <>
                {items.length} {getItemLabel(items.length)}
                {props.pagination?.total && props.pagination.total > items.length && (
                  <span className="text-white/60"> (of {props.pagination.total} total)</span>
                )}
              </>
            )}
          </div>
          {props.pagination && props.onPageChange && (props.pagination.prev || props.pagination.next) && (
            <div className="flex items-center gap-2">
              <Button
                variant="plain"
                onClick={() => {
                  if (props.pagination?.prev !== undefined) {
                    props.onPageChange?.(props.pagination.prev, 'prev')
                  }
                }}
                isDisabled={!props.pagination.prev}
                aria-label="Previous page"
              >
                <AngleLeftIcon className="mr-1 size-4" />
                Previous
              </Button>
              <Button
                variant="plain"
                onClick={() => {
                  if (props.pagination?.next !== undefined) {
                    props.onPageChange?.(props.pagination.next, 'next')
                  }
                }}
                isDisabled={!props.pagination.next}
                aria-label="Next page"
              >
                Next
                <AngleRightIcon className="ml-1 size-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
