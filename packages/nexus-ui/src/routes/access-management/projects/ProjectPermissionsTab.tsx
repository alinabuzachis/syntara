import { Button, Flex, FlexItem, Label } from '@patternfly/react-core'
import { PlusIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { useMemo, useState } from 'react'

import { useAlerts } from '../../../components/alerts'
import { EmptyStateNoData } from '../../../components/EmptyStateNoData'
import { IconLabel } from '../../../components/IconLabel'
import { ErrorState } from '../../../components/states/ErrorState'
import { LoadingState } from '../../../components/states/LoadingState'
import { getErrorMessage } from '../../../utils/apiErrors'
import { formatDateTime } from '../../../utils/dateUtils'
import { accessClient } from '../../access/accessClient'
import type { ProjectRoleAssignmentRead } from '../../access/types'

import { AssignProjectRoleModal } from './AssignProjectRoleModal'
import { UnassignProjectRoleDialog } from './UnassignProjectRoleDialog'

function getPermissionRowActions(
  assignment: ProjectRoleAssignmentRead,
  onUnassign: (assignment: ProjectRoleAssignmentRead) => void
): IAction[] {
  return [
    {
      title: <IconLabel icon={<RhUiTrashIcon />}>Unassign</IconLabel>,
      onClick: () => onUnassign(assignment),
    },
  ]
}

export function ProjectPermissionsTab({ projectId }: Readonly<{ projectId: string }>) {
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assignmentToUnassign, setAssignmentToUnassign] = useState<ProjectRoleAssignmentRead | null>(null)
  const { showSuccess, showError } = useAlerts()

  const rolesQuery = accessClient.useQuery('get', '/projects/{project_id}/roles', {
    params: { path: { project_id: projectId } },
  })

  const assignments = useMemo(() => rolesQuery.data ?? [], [rolesQuery.data])

  const assignedRolesByUser = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const a of assignments) {
      const existing = map.get(a.user_id)
      if (existing) {
        existing.add(a.role_name)
      } else {
        map.set(a.user_id, new Set([a.role_name]))
      }
    }
    return map
  }, [assignments])

  const handleAssignSuccess = () => {
    rolesQuery.refetch().catch(() => {})
  }

  const { mutate: deleteProjectRole } = accessClient.useMutation(
    'delete',
    '/projects/{project_id}/roles/{assignment_id}'
  )

  const handleUnassign = () => {
    if (!assignmentToUnassign) return
    deleteProjectRole(
      {
        params: {
          path: { project_id: projectId, assignment_id: assignmentToUnassign.id },
        },
      },
      {
        onSuccess: () => {
          showSuccess(
            'Role unassigned',
            `Role "${assignmentToUnassign.role_name}" has been unassigned from ${assignmentToUnassign.username ?? assignmentToUnassign.user_id}.`
          )
          rolesQuery.refetch().catch(() => {})
        },
        onError: (err: unknown) => {
          showError('Failed to unassign role', getErrorMessage(err))
        },
        onSettled: () => setAssignmentToUnassign(null),
      }
    )
  }

  if (rolesQuery.isError) {
    return (
      <ErrorState
        title="Error loading permissions"
        message={rolesQuery.error}
        onRetry={() => rolesQuery.refetch().catch(() => {})}
      />
    )
  }

  if (rolesQuery.isPending) return <LoadingState />

  if (assignments.length === 0) {
    return (
      <>
        <EmptyStateNoData
          title="No permissions"
          description="No users have roles assigned in this project."
          buttonText="Assign role"
          addData={() => setAssignModalOpen(true)}
        />
        {assignModalOpen && (
          <AssignProjectRoleModal
            projectId={projectId}
            isOpen={assignModalOpen}
            onClose={() => setAssignModalOpen(false)}
            onSuccess={handleAssignSuccess}
            assignedRolesByUser={assignedRolesByUser}
          />
        )}
      </>
    )
  }

  return (
    <>
      <Flex
        alignItems={{ default: 'alignItemsCenter' }}
        justifyContent={{ default: 'justifyContentFlexEnd' }}
        style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}
      >
        <FlexItem>
          <Button variant="primary" icon={<PlusIcon />} onClick={() => setAssignModalOpen(true)}>
            Assign role
          </Button>
        </FlexItem>
      </Flex>
      <Table aria-label="Project permissions" isStriped>
        <Thead>
          <Tr>
            <Th>Username</Th>
            <Th>Role</Th>
            <Th>Assigned</Th>
            <Th screenReaderText="Actions" />
          </Tr>
        </Thead>
        <Tbody>
          {assignments.map((a) => (
            <Tr key={a.id}>
              <Td dataLabel="Username">{a.username ?? a.user_id}</Td>
              <Td dataLabel="Role">
                <Label isCompact color="green">
                  {a.role_name}
                </Label>
              </Td>
              <Td dataLabel="Assigned">{formatDateTime(a.created_at)}</Td>
              <Td isActionCell>
                <ActionsColumn items={getPermissionRowActions(a, setAssignmentToUnassign)} />
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      {assignModalOpen && (
        <AssignProjectRoleModal
          projectId={projectId}
          isOpen={assignModalOpen}
          onClose={() => setAssignModalOpen(false)}
          onSuccess={handleAssignSuccess}
          assignedRolesByUser={assignedRolesByUser}
        />
      )}
      <UnassignProjectRoleDialog
        assignment={assignmentToUnassign}
        isOpen={!!assignmentToUnassign}
        onClose={() => setAssignmentToUnassign(null)}
        onConfirm={handleUnassign}
      />
    </>
  )
}
