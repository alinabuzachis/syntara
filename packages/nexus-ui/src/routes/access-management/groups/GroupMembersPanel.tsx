import { Button, Flex, FlexItem, StackItem, Truncate } from '@patternfly/react-core'
import { PlusIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { useMemo, useState } from 'react'

import { ConfirmationDialog } from '../../../components/ConfirmationDialog'
import { EmptyStateFilter } from '../../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../../components/EmptyStateNoData'
import { FilterBar } from '../../../components/filters'
import { IconLabel } from '../../../components/IconLabel'
import { NxPageBody } from '../../../components/layout/NxPage'
import { NxPanelContentStack } from '../../../components/layout/NxPanelContentStack'
import { useQueryState } from '../../../components/states/useQueryState'
import { ScrollableTableContainer } from '../../../components/table/ScrollableTableContainer'
import { useFilterState } from '../../../hooks/useFilterState'
import { useAlerts } from '../../../providers/alerts'
import type { FilterFieldDefinition } from '../../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../../types/filters'
import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'
import { accessClient } from '../../access/accessClient'
import { DisabledBadge } from '../DisabledBadge'
import { MembershipSourceLabels } from '../MembershipSourceLabels'
import { getMembershipSources } from '../membershipSourceUtils'

import { AddMemberModal } from './AddMemberModal'

const filterFieldDefinitions: FilterFieldDefinition[] = [
  {
    key: 'username',
    label: 'Username',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by username',
  },
]

type GroupMembersPanelProps = {
  groupId: string
  onMembershipChange: () => void
}

type MemberInfo = {
  id: string
  username: string
}

function getMemberActions(member: MemberInfo, onRemove: (m: MemberInfo) => void): IAction[] {
  return [
    {
      title: <IconLabel icon={<RhUiTrashIcon />}>Remove</IconLabel>,
      onClick: () => onRemove(member),
    },
  ]
}

export function GroupMembersPanel({ groupId, onMembershipChange }: Readonly<GroupMembersPanelProps>) {
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [memberToRemove, setMemberToRemove] = useState<MemberInfo | null>(null)
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

  const query = accessClient.useQuery('get', '/groups/{group_id}/members', {
    params: { path: { group_id: groupId } },
  })

  const members = useMemo(() => query.data?.resources ?? [], [query.data])

  const filteredMembers = useMemo(() => {
    const nameFilter = filters.find((f) => f.key === 'username')
    if (!nameFilter) return members
    const term = String(nameFilter.value).toLowerCase()
    return members.filter((m) => m.username.toLowerCase().includes(term))
  }, [members, filters])

  const paginatedMembers = useMemo(() => {
    const start = (page - 1) * perPage
    return filteredMembers.slice(start, start + perPage)
  }, [filteredMembers, page, perPage])

  const { mutate: removeMember } = accessClient.useMutation('delete', '/groups/{group_id}/members/{user_id}')

  const handleRemove = () => {
    if (!memberToRemove) return
    removeMember(
      { params: { path: { group_id: groupId, user_id: memberToRemove.id } } },
      {
        onSuccess: () => {
          showAlert({
            title: 'Member removed',
            description: `User "${memberToRemove.username}" has been removed from the group.`,
            variant: 'success',
            autoDismiss: true,
          })
          detachPromise(query.refetch())
          onMembershipChange()
        },
        onError: (err: unknown) => {
          showAlert({
            title: 'Failed to remove member',
            description: getErrorMessage(err),
            variant: 'error',
            autoDismiss: true,
          })
        },
        onSettled: () => setMemberToRemove(null),
      }
    )
  }

  const handleMemberAdded = () => {
    detachPromise(query.refetch())
    onMembershipChange()
  }

  const queryState = useQueryState(query, {
    title: 'Error loading members',
    onRetry: () => detachPromise(query.refetch()),
  })
  if (queryState) return queryState

  if (members.length === 0) {
    return (
      <>
        <EmptyStateNoData
          title="No members"
          description="Add users to this group to manage their access."
          buttonText="Add member"
          addData={() => setAddModalOpen(true)}
        />
        <AddMemberModal
          groupId={groupId}
          isOpen={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          onSuccess={handleMemberAdded}
          existingMemberIds={[]}
        />
      </>
    )
  }

  return (
    <>
      <NxPanelContentStack>
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
                Add member
              </Button>
            </FlexItem>
          </Flex>
        </StackItem>

        {filteredMembers.length === 0 ? (
          <NxPageBody isCentered>
            <EmptyStateFilter
              clearAllFilters={() => {
                clearAllFilters()
                setPage(1)
              }}
            />
          </NxPageBody>
        ) : (
          <ScrollableTableContainer
            aria-label="Group members table"
            footer={{
              page,
              perPage,
              total: filteredMembers.length,
              hasNext: page * perPage < filteredMembers.length,
              onPrev: () => setPage((p) => Math.max(1, p - 1)),
              onNext: () => setPage((p) => p + 1),
              onPerPageChange: handlePerPageChange,
            }}
          >
            <Thead>
              <Tr>
                <Th>Username</Th>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Source</Th>
                <Th screenReaderText="Actions" />
              </Tr>
            </Thead>
            <Tbody>
              {paginatedMembers.map((member) => (
                <Tr key={member.id}>
                  <Td dataLabel="Username">
                    <Truncate content={member.username} />
                    {!member.is_enabled && <DisabledBadge />}
                  </Td>
                  <Td dataLabel="Name">
                    <Truncate content={member.full_name ?? ''} />
                  </Td>
                  <Td dataLabel="Email">
                    <Truncate content={member.email ?? ''} />
                  </Td>
                  <Td dataLabel="Source">
                    <MembershipSourceLabels sources={getMembershipSources(member)} />
                  </Td>
                  <Td isActionCell>
                    {!member.is_builtin && (
                      <ActionsColumn
                        items={getMemberActions({ id: member.id, username: member.username }, setMemberToRemove)}
                      />
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </ScrollableTableContainer>
        )}
      </NxPanelContentStack>

      <AddMemberModal
        groupId={groupId}
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={handleMemberAdded}
        existingMemberIds={members.map((m) => m.id)}
      />

      <ConfirmationDialog
        isOpen={!!memberToRemove}
        onClose={() => setMemberToRemove(null)}
        onConfirm={handleRemove}
        title="Remove member?"
        confirmLabel="Remove"
        confirmVariant="danger"
        titleIconVariant="warning"
      >
        This removes <strong>{memberToRemove?.username}</strong> from the group. They will lose any permissions granted
        through this group membership.
      </ConfirmationDialog>
    </>
  )
}
