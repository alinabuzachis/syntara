import type { Group } from '@ansible/nexus-contracts'
import {
  Button,
  Flex,
  FlexItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import { PlusIcon, RhUiEditFillIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { Thead, Tbody, Tr, Th, Td, ActionsColumn } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { useEffect, useMemo, useReducer } from 'react'

import { usersClient } from '../../client'
import { useAlerts } from '../../components/alerts'
import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { FilterBar } from '../../components/filters/FilterBar'
import { IconLabel } from '../../components/IconLabel'
import { useQueryState } from '../../components/states/useQueryState'
import { ScrollableTableContainer } from '../../components/table/ScrollableTableContainer'
import { useFilterState } from '../../hooks/useFilterState'
import { useTableSort } from '../../hooks/useTableSort'
import type { FilterFieldDefinition } from '../../types/filters'
import { getErrorMessage } from '../../utils/apiErrors'
import { formatDateTime } from '../../utils/dateUtils'
import { buildFilterParams } from '../../utils/filterUtils'

import { createFilterChangeHandler, getGroupNameFilterDefinition } from './groupFilters'
import { GroupFormModal } from './GroupFormModal'

interface GroupsState {
  cursor: string | null
  deleteDialogOpen: boolean
  groupToDelete: Group | null
  formModalOpen: boolean
  groupToEdit: Group | null
}

type GroupsAction =
  | { type: 'SET_CURSOR'; payload: string | null }
  | { type: 'OPEN_DELETE_DIALOG'; payload: Group }
  | { type: 'CLOSE_DELETE_DIALOG' }
  | { type: 'OPEN_CREATE_MODAL' }
  | { type: 'OPEN_EDIT_MODAL'; payload: Group }
  | { type: 'CLOSE_FORM_MODAL' }

function groupsReducer(state: GroupsState, action: GroupsAction): GroupsState {
  switch (action.type) {
    case 'SET_CURSOR':
      return { ...state, cursor: action.payload }
    case 'OPEN_DELETE_DIALOG':
      return { ...state, groupToDelete: action.payload, deleteDialogOpen: true }
    case 'CLOSE_DELETE_DIALOG':
      return { ...state, deleteDialogOpen: false, groupToDelete: null }
    case 'OPEN_CREATE_MODAL':
      return { ...state, formModalOpen: true, groupToEdit: null }
    case 'OPEN_EDIT_MODAL':
      return { ...state, formModalOpen: true, groupToEdit: action.payload }
    case 'CLOSE_FORM_MODAL':
      return { ...state, formModalOpen: false, groupToEdit: null }
    default:
      return state
  }
}

function getRowActions(group: Group, dispatch: (action: GroupsAction) => void): IAction[] {
  return [
    {
      title: <IconLabel icon={<RhUiEditFillIcon />}>Edit</IconLabel>,
      onClick: () => dispatch({ type: 'OPEN_EDIT_MODAL', payload: group }),
    },
    { isSeparator: true },
    {
      title: <IconLabel icon={<RhUiTrashIcon />}>Delete</IconLabel>,
      onClick: () => dispatch({ type: 'OPEN_DELETE_DIALOG', payload: group }),
    },
  ]
}

function DeleteGroupDialog({
  group,
  isOpen,
  onClose,
  onDelete,
}: Readonly<{
  group: Group | null
  isOpen: boolean
  onClose: () => void
  onDelete: () => void
}>) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} variant="small">
      <ModalHeader title="Delete group" />
      <ModalBody>Are you sure you want to delete &quot;{group?.name}&quot;? This action cannot be undone.</ModalBody>
      <ModalFooter>
        <Button variant="danger" onClick={onDelete}>
          Delete
        </Button>
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}

export function GroupsTab() {
  const [state, dispatch] = useReducer(groupsReducer, {
    cursor: null,
    deleteDialogOpen: false,
    groupToDelete: null,
    formModalOpen: false,
    groupToEdit: null,
  })
  const { cursor, deleteDialogOpen, groupToDelete, formModalOpen, groupToEdit } = state

  const { filters, clearAllFilters, setAllFilters } = useFilterState()

  const filterFieldDefinitions = useMemo<FilterFieldDefinition[]>(() => [getGroupNameFilterDefinition()], [])

  const handleFilterChange = createFilterChangeHandler(
    cursor,
    () => dispatch({ type: 'SET_CURSOR', payload: null }),
    clearAllFilters,
    setAllFilters
  )

  const handleClearAllFilters = () => {
    if (cursor) {
      dispatch({ type: 'SET_CURSOR', payload: null })
    }
    clearAllFilters()
  }

  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = {
      limit: 20,
      include_total: true,
      ...buildFilterParams(filters),
      ...(cursor ? { cursor } : {}),
    }
    return params
  }, [filters, cursor])

  const query = usersClient.useQuery('get', '/groups', {
    params: {
      query: queryParams,
    },
  })

  const { showAlert } = useAlerts()

  const data = query.data
  const groups = data?.resources ?? []
  const prevCursor = data?.prev ?? null
  const nextCursor = data?.next ?? null
  const totalCount = data?.total ?? null
  const hasActiveFilters = filters.length > 0

  useEffect(() => {
    if (groups.length === 0 && !hasActiveFilters && cursor && !query.isFetching) {
      dispatch({ type: 'SET_CURSOR', payload: null })
    }
  }, [groups.length, hasActiveFilters, cursor, query.isFetching])

  const { activeSortIndex, getSortParams, sortData } = useTableSort({
    initialSortIndex: 0,
    initialDirection: 'asc',
  })

  const results = sortData(groups, (group) => {
    switch (activeSortIndex) {
      case 0:
        return group.name ?? ''
      case 1:
        return group.description ?? ''
      case 2:
        return group.created_at ?? ''
      case 3:
        return group.updated_at ?? ''
      default:
        return group.name ?? ''
    }
  })

  const { mutate: deleteGroup } = usersClient.useMutation('delete', '/groups/{group_id}')

  const handleDelete = () => {
    if (!groupToDelete) return

    deleteGroup(
      { params: { path: { group_id: groupToDelete.id } } },
      {
        onSuccess: () => {
          showAlert({
            title: 'Group deleted',
            description: `Group "${groupToDelete.name}" has been deleted successfully.`,
            variant: 'success',
            autoDismiss: true,
          })
          query.refetch().catch(() => {})
        },
        onError: (error: unknown) => {
          showAlert({
            title: 'Delete failed',
            description: `Failed to delete group "${groupToDelete.name}": ${getErrorMessage(error)}`,
            variant: 'error',
            autoDismiss: true,
          })
        },
        onSettled: () => {
          dispatch({ type: 'CLOSE_DELETE_DIALOG' })
        },
      }
    )
  }

  const queryState = useQueryState(query, { title: 'Error loading groups', onRetry: () => void query.refetch() })
  if (queryState) {
    return queryState
  }

  return (
    <>
      {results.length === 0 && !hasActiveFilters ? (
        <EmptyStateNoData
          title="No groups"
          description="Create a group to organize users and manage access."
          buttonText="Add group"
          addData={() => dispatch({ type: 'OPEN_CREATE_MODAL' })}
        />
      ) : (
        <Stack style={{ height: '100%' }}>
          <StackItem>
            <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
              <FlexItem grow={{ default: 'grow' }}>
                <FilterBar
                  fieldDefinitions={filterFieldDefinitions}
                  filters={filters}
                  onFilterChange={handleFilterChange}
                  showClearAll={true}
                />
              </FlexItem>
              <FlexItem>
                <Button variant="primary" icon={<PlusIcon />} onClick={() => dispatch({ type: 'OPEN_CREATE_MODAL' })}>
                  Add group
                </Button>
              </FlexItem>
            </Flex>
          </StackItem>

          {results.length === 0 ? (
            <StackItem isFilled style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <EmptyStateFilter clearAllFilters={handleClearAllFilters} />
            </StackItem>
          ) : (
            <StackItem isFilled style={{ minHeight: 0, overflow: 'auto' }}>
              <ScrollableTableContainer
                aria-label="Groups table"
                footer={{
                  content: (
                    <>
                      {results.length} {results.length === 1 ? 'group' : 'groups'}
                      {totalCount != null && totalCount > results.length && (
                        <span style={{ opacity: 0.6 }}> (of {totalCount} total)</span>
                      )}
                    </>
                  ),
                  prev: prevCursor,
                  next: nextCursor,
                  onPrev: () => dispatch({ type: 'SET_CURSOR', payload: prevCursor }),
                  onNext: () => dispatch({ type: 'SET_CURSOR', payload: nextCursor }),
                }}
              >
                <Thead>
                  <Tr>
                    <Th sort={getSortParams(0)}>Name</Th>
                    <Th sort={getSortParams(1)}>Description</Th>
                    <Th sort={getSortParams(2)}>Created</Th>
                    <Th sort={getSortParams(3)}>Updated</Th>
                    <Th screenReaderText="Actions" />
                  </Tr>
                </Thead>
                <Tbody>
                  {results.map((group) => (
                    <Tr key={group.id}>
                      <Td dataLabel="Name">{group.name}</Td>
                      <Td dataLabel="Description">{group.description ?? ''}</Td>
                      <Td dataLabel="Created">{formatDateTime(group.created_at)}</Td>
                      <Td dataLabel="Updated">{formatDateTime(group.updated_at)}</Td>
                      <Td isActionCell>
                        <ActionsColumn items={getRowActions(group, dispatch)} />
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </ScrollableTableContainer>
            </StackItem>
          )}
        </Stack>
      )}

      <GroupFormModal
        group={groupToEdit}
        isOpen={formModalOpen}
        onClose={() => dispatch({ type: 'CLOSE_FORM_MODAL' })}
        onSuccess={() => {
          query.refetch().catch(() => {})
        }}
      />

      <DeleteGroupDialog
        group={groupToDelete}
        isOpen={deleteDialogOpen}
        onClose={() => dispatch({ type: 'CLOSE_DELETE_DIALOG' })}
        onDelete={handleDelete}
      />
    </>
  )
}
