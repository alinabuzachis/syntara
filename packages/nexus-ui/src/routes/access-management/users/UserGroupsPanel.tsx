import type { Group } from '@ansible/nexus-contracts'
import {
  Button,
  Flex,
  FlexItem,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  StackItem,
  Truncate,
} from '@patternfly/react-core'
import { PlusIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { useMemo, useState } from 'react'

import { AppPageMain } from '../../../app/AppPage'
import { ConfirmationDialog } from '../../../components/ConfirmationDialog'
import { EmptyStateFilter } from '../../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../../components/EmptyStateNoData'
import { FilterBar } from '../../../components/filters'
import { IconLabel } from '../../../components/IconLabel'
import { PanelContentStack } from '../../../components/PanelContentStack'
import { useQueryState } from '../../../components/states/useQueryState'
import { ScrollableTableContainer } from '../../../components/table/ScrollableTableContainer'
import { useFilterState } from '../../../hooks/useFilterState'
import { useAlerts } from '../../../providers/alerts'
import type { FilterFieldDefinition } from '../../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../../types/filters'
import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'
import { accessClient } from '../../access/accessClient'
import { TypeaheadSelect } from '../../access/TypeaheadSelect'
import { useAllGroups } from '../../access/useAllGroups'
import { BUILTIN_AUTHENTICATED_GROUP_NAME } from '../adminConstants'
import { MembershipSourceLabels } from '../MembershipSourceLabels'
import { getMembershipSources } from '../membershipSourceUtils'

const filterFieldDefinitions: FilterFieldDefinition[] = [
  {
    key: 'name',
    label: 'Name',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by name',
  },
  {
    key: 'description',
    label: 'Description',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by description',
  },
]

type UserGroupsPanelProps = {
  userId: string
}

type GroupInfo = {
  id: string
  name: string
}

function AddToGroupModal({
  userId,
  isOpen,
  onClose,
  onSuccess,
  existingGroupIds,
}: Readonly<{
  userId: string
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  existingGroupIds: string[]
}>) {
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { showAlert } = useAlerts()

  const { groups: allGroupsForPicker } = useAllGroups()

  const availableGroups = useMemo(() => {
    return allGroupsForPicker
      .filter((g): g is typeof g & { id: string } => !!g.id && !existingGroupIds.includes(g.id))
      .map((g) => ({
        value: g.id,
        label: g.name,
        description: g.description ?? undefined,
      }))
  }, [allGroupsForPicker, existingGroupIds])

  const { mutate: addMember, isPending } = accessClient.useMutation('post', '/groups/{group_id}/members')

  const handleClose = () => {
    setSelectedGroupId('')
    setError(null)
    onClose()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedGroupId) {
      setError('Please select a group')
      return
    }

    addMember(
      {
        params: { path: { group_id: selectedGroupId } },
        body: { user_id: userId },
      },
      {
        onSuccess: () => {
          const group = availableGroups.find((g) => g.value === selectedGroupId)
          showAlert({
            title: 'Added to group',
            description: `User has been added to group "${group?.label ?? selectedGroupId}".`,
            variant: 'success',
            autoDismiss: true,
          })
          handleClose()
          onSuccess()
        },
        onError: (err: unknown) => {
          showAlert({
            title: 'Failed to add to group',
            description: getErrorMessage(err),
            variant: 'error',
            autoDismiss: true,
          })
        },
      }
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} variant="medium">
      <ModalHeader title="Add to group" />
      <ModalBody>
        <form id="add-to-group-form" onSubmit={handleSubmit}>
          <TypeaheadSelect
            id="add-to-group-select"
            ariaLabel="Select a group"
            options={availableGroups}
            selected={selectedGroupId}
            onChange={(value) => {
              setSelectedGroupId(value)
              setError(null)
            }}
            placeholder="Search for a group..."
            hasError={!!error}
          />
        </form>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" type="submit" form="add-to-group-form" isDisabled={isPending} isLoading={isPending}>
          Add
        </Button>
        <Button variant="link" onClick={handleClose} isDisabled={isPending}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}

function applyGroupFilters<T extends { name: string; description?: string | null }>(
  groups: T[],
  filters: { key: string; value: unknown }[]
): T[] {
  let result = groups
  const nameFilter = filters.find((f) => f.key === 'name')
  if (nameFilter) {
    const term = String(nameFilter.value).toLowerCase()
    result = result.filter((g) => g.name.toLowerCase().includes(term))
  }
  const descFilter = filters.find((f) => f.key === 'description')
  if (descFilter) {
    const term = String(descFilter.value).toLowerCase()
    result = result.filter((g) => (g.description ?? '').toLowerCase().includes(term))
  }
  return result
}

function getGroupActions(group: Group, onRemove: (g: GroupInfo) => void): IAction[] {
  if (group.name === BUILTIN_AUTHENTICATED_GROUP_NAME) return []
  return [
    {
      title: <IconLabel icon={<RhUiTrashIcon />}>Remove</IconLabel>,
      onClick: () => onRemove({ id: group.id, name: group.name }),
    },
  ]
}

export function UserGroupsPanel({ userId }: Readonly<UserGroupsPanelProps>) {
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [groupToRemove, setGroupToRemove] = useState<GroupInfo | null>(null)
  const { filters, setAllFilters, clearAllFilters } = useFilterState()
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const { showAlert } = useAlerts()

  const handleFilterChange = (newFilters: typeof filters) => {
    setAllFilters(newFilters)
    setPage(1)
  }

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage)
    setPage(1)
  }

  const query = accessClient.useQuery('get', '/users/{user_id}/groups', {
    params: { path: { user_id: userId } },
  })

  const { groups: allGroupsList } = useAllGroups()

  const groups = useMemo(() => {
    const userGroups = query.data?.resources ?? []
    const hasAuthenticated = userGroups.some((g) => g.name === BUILTIN_AUTHENTICATED_GROUP_NAME)
    if (hasAuthenticated) return userGroups

    const authenticatedGroup = allGroupsList.find((g) => g.name === BUILTIN_AUTHENTICATED_GROUP_NAME)
    if (authenticatedGroup) return [authenticatedGroup, ...userGroups]
    return userGroups
  }, [query.data, allGroupsList])

  const filteredGroups = useMemo(() => applyGroupFilters(groups, filters), [groups, filters])

  const paginatedGroups = useMemo(() => {
    const start = (page - 1) * perPage
    return filteredGroups.slice(start, start + perPage)
  }, [filteredGroups, page, perPage])

  const { mutate: removeMember } = accessClient.useMutation('delete', '/groups/{group_id}/members/{user_id}')

  const handleRemove = () => {
    if (!groupToRemove) return
    removeMember(
      { params: { path: { group_id: groupToRemove.id, user_id: userId } } },
      {
        onSuccess: () => {
          showAlert({
            title: 'Removed from group',
            description: `User has been removed from group "${groupToRemove.name}".`,
            variant: 'success',
            autoDismiss: true,
          })
          detachPromise(query.refetch())
        },
        onError: (err: unknown) => {
          showAlert({
            title: 'Failed to remove from group',
            description: getErrorMessage(err),
            variant: 'error',
            autoDismiss: true,
          })
        },
        onSettled: () => setGroupToRemove(null),
      }
    )
  }

  const queryState = useQueryState(query, {
    title: 'Error loading groups',
    onRetry: () => detachPromise(query.refetch()),
  })
  if (queryState) return queryState

  if (groups.length === 0) {
    return (
      <>
        <EmptyStateNoData
          title="No groups"
          description="This user is not a member of any groups."
          buttonText="Add to group"
          addData={() => setAddModalOpen(true)}
        />
        <AddToGroupModal
          userId={userId}
          isOpen={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          onSuccess={() => detachPromise(query.refetch())}
          existingGroupIds={[]}
        />
      </>
    )
  }

  return (
    <>
      <PanelContentStack>
        <StackItem>
          <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
            <FlexItem grow={{ default: 'grow' }}>
              <FilterBar
                fieldDefinitions={filterFieldDefinitions}
                filters={filters}
                onFilterChange={handleFilterChange}
                showClearAll={true}
                clearAllFilters={() => {
                  clearAllFilters()
                  setPage(1)
                }}
              />
            </FlexItem>
            <FlexItem>
              <Button variant="primary" icon={<PlusIcon />} onClick={() => setAddModalOpen(true)}>
                Add to group
              </Button>
            </FlexItem>
          </Flex>
        </StackItem>

        {filteredGroups.length === 0 ? (
          <AppPageMain isCentered>
            <EmptyStateFilter
              clearAllFilters={() => {
                clearAllFilters()
                setPage(1)
              }}
            />
          </AppPageMain>
        ) : (
          <ScrollableTableContainer
            aria-label="User groups table"
            footer={{
              page,
              perPage,
              total: filteredGroups.length,
              hasNext: page * perPage < filteredGroups.length,
              onPrev: () => setPage((p) => Math.max(1, p - 1)),
              onNext: () => setPage((p) => p + 1),
              onPerPageChange: handlePerPageChange,
            }}
          >
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>Description</Th>
                <Th>Source</Th>
                <Th screenReaderText="Actions" />
              </Tr>
            </Thead>
            <Tbody>
              {paginatedGroups.map((group) => (
                <Tr key={group.id}>
                  <Td dataLabel="Name">
                    <Truncate content={group.name} />
                    {group.name === BUILTIN_AUTHENTICATED_GROUP_NAME && (
                      <>
                        {' '}
                        <Label isCompact color="grey">
                          All users
                        </Label>
                      </>
                    )}
                  </Td>
                  <Td dataLabel="Description">
                    <Truncate content={group.description ?? ''} />
                  </Td>
                  <Td dataLabel="Source">
                    <MembershipSourceLabels sources={getMembershipSources(group)} />
                  </Td>
                  <Td isActionCell>
                    {group.name !== BUILTIN_AUTHENTICATED_GROUP_NAME && (
                      <ActionsColumn items={getGroupActions(group as Group, setGroupToRemove)} />
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </ScrollableTableContainer>
        )}
      </PanelContentStack>

      <AddToGroupModal
        userId={userId}
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={() => detachPromise(query.refetch())}
        existingGroupIds={groups.flatMap((g) => (g.id ? [g.id] : []))}
      />

      <ConfirmationDialog
        isOpen={!!groupToRemove}
        onClose={() => setGroupToRemove(null)}
        onConfirm={handleRemove}
        title="Remove from group"
        confirmLabel="Remove"
        confirmVariant="danger"
        titleIconVariant="warning"
      >
        Are you sure you want to remove this user from group &quot;{groupToRemove?.name}&quot;?
      </ConfirmationDialog>
    </>
  )
}
