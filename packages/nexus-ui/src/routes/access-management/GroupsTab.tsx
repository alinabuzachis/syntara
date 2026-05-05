import type { Group } from '@ansible/nexus-contracts'
import { Badge, Button, Flex, FlexItem, StackItem } from '@patternfly/react-core'
import { PlusIcon, RhUiEditFillIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { Thead, Tbody, Tr, Th, Td, ActionsColumn } from '@patternfly/react-table'
import { useMemo } from 'react'
import { navigate } from 'wouter/use-browser-location'

import { AppPageMain } from '../../app/AppPage'
import { AppRoute } from '../../app/AppRoute'
import { usersClient } from '../../client'
import { ConfirmationDialog } from '../../components/ConfirmationDialog'
import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { FilterBar } from '../../components/filters/FilterBar'
import { IconLabel } from '../../components/IconLabel'
import { PanelContentStack } from '../../components/PanelContentStack'
import { useQueryState } from '../../components/states/useQueryState'
import { ScrollableTableContainer } from '../../components/table/ScrollableTableContainer'
import { useCursorPagination, useCursorReset } from '../../hooks/useCursorPagination'
import { useDeleteAction } from '../../hooks/useDeleteAction'
import { useDialogState } from '../../hooks/useDialogState'
import { useTableSort } from '../../hooks/useTableSort'
import type { FilterFieldDefinition } from '../../types/filters'
import { formatDateTime } from '../../utils/dateUtils'
import { detachPromise } from '../../utils/detachPromise'

import { getGroupDescriptionFilterDefinition, getGroupNameFilterDefinition } from './groupFilters'
import { GroupFormModal } from './GroupFormModal'

export function GroupsTab() {
  const deleteDialog = useDialogState<Group>()
  const formDialog = useDialogState<Group | null>()

  const {
    cursor,
    resetPagination,
    filters,
    hasActiveFilters,
    queryParams,
    handleFilterChange,
    handleClearAllFilters,
    getFooterProps,
  } = useCursorPagination()

  const filterFieldDefinitions = useMemo<FilterFieldDefinition[]>(
    () => [getGroupNameFilterDefinition(), getGroupDescriptionFilterDefinition()],
    []
  )

  const query = usersClient.useQuery('get', '/groups', {
    params: {
      query: queryParams,
    },
  })

  const data = query.data
  const groups = data?.resources ?? []

  useCursorReset(groups.length, hasActiveFilters, cursor, query.isFetching, resetPagination)

  const { activeSortIndex, getSortParams, sortData } = useTableSort({
    initialSortIndex: 0,
    initialDirection: 'asc',
  })

  const results = sortData(groups, (group) => {
    switch (activeSortIndex) {
      case 0:
        return group.name ?? ''
      case 1:
        return group.description
      case 3:
        return group.created_at ? new Date(group.created_at).getTime() : undefined
      case 4:
        return group.updated_at ? new Date(group.updated_at).getTime() : undefined
      default:
        return group.name ?? ''
    }
  })

  const { mutate: deleteGroup } = usersClient.useMutation('delete', '/groups/{group_id}')

  const handleDelete = useDeleteAction({
    deleteFn: deleteGroup,
    buildParams: (group: Group) => ({ params: { path: { group_id: group.id } } }),
    entityLabel: 'group',
    getItemName: (group: Group) => group.name,
    onSuccess: () => {
      detachPromise(query.refetch())
    },
    onSettled: deleteDialog.close,
  })

  const queryState = useQueryState(query, {
    title: 'Error loading groups',
    onRetry: () => detachPromise(query.refetch()),
  })
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
          addData={() => formDialog.open(null)}
        />
      ) : (
        <PanelContentStack>
          <StackItem>
            <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
              <FlexItem grow={{ default: 'grow' }}>
                <FilterBar
                  fieldDefinitions={filterFieldDefinitions}
                  filters={filters}
                  onFilterChange={handleFilterChange}
                  showClearAll={true}
                  clearAllFilters={handleClearAllFilters}
                />
              </FlexItem>
              <FlexItem>
                <Button variant="primary" icon={<PlusIcon />} onClick={() => formDialog.open(null)}>
                  Add group
                </Button>
              </FlexItem>
            </Flex>
          </StackItem>

          {results.length === 0 ? (
            <AppPageMain isCentered>
              <EmptyStateFilter clearAllFilters={handleClearAllFilters} />
            </AppPageMain>
          ) : (
            <ScrollableTableContainer aria-label="Groups table" footer={getFooterProps(data)}>
              <Thead>
                <Tr>
                  <Th sort={getSortParams(0)}>Name</Th>
                  <Th sort={getSortParams(1)}>Description</Th>
                  <Th>Members</Th>
                  <Th sort={getSortParams(3)}>Created</Th>
                  <Th sort={getSortParams(4)}>Updated</Th>
                  <Th screenReaderText="Actions" />
                </Tr>
              </Thead>
              <Tbody>
                {results.map((group) => (
                  <Tr key={group.id}>
                    <Td dataLabel="Name">
                      <Button
                        variant="link"
                        isInline
                        onClick={() =>
                          navigate(AppRoute.AccessManagement.GroupDetail.replace(':groupId', group.id ?? ''))
                        }
                      >
                        {group.name}
                      </Button>
                    </Td>
                    <Td dataLabel="Description">{group.description ?? ''}</Td>
                    <Td dataLabel="Members">
                      <Badge isRead>{group.member_count ?? 0}</Badge>
                    </Td>
                    <Td dataLabel="Created">{formatDateTime(group.created_at)}</Td>
                    <Td dataLabel="Updated">{formatDateTime(group.updated_at)}</Td>
                    <Td isActionCell>
                      {!group.is_builtin && (
                        <ActionsColumn
                          items={[
                            {
                              title: <IconLabel icon={<RhUiEditFillIcon />}>Edit</IconLabel>,
                              onClick: () => formDialog.open(group as Group),
                            },
                            { isSeparator: true },
                            {
                              title: <IconLabel icon={<RhUiTrashIcon />}>Delete</IconLabel>,
                              onClick: () => deleteDialog.open(group as Group),
                            },
                          ]}
                        />
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </ScrollableTableContainer>
          )}
        </PanelContentStack>
      )}

      <GroupFormModal
        group={formDialog.item}
        isOpen={formDialog.isOpen}
        onClose={formDialog.close}
        onSuccess={() => {
          detachPromise(query.refetch())
        }}
      />

      <ConfirmationDialog
        isOpen={deleteDialog.isOpen}
        onClose={deleteDialog.close}
        onConfirm={() => handleDelete(deleteDialog.item)}
        title="Delete group"
        confirmLabel="Delete"
        confirmVariant="danger"
      >
        Are you sure you want to delete &quot;{deleteDialog.item?.name}&quot;? This action cannot be undone.
      </ConfirmationDialog>
    </>
  )
}
