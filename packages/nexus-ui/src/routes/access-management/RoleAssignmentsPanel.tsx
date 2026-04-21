import {
  Alert,
  Button,
  Flex,
  FlexItem,
  Label,
  LabelGroup,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import { PlusIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useMemo, useState } from 'react'

import { useAlerts } from '../../components/alerts'
import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { FilterBar } from '../../components/filters'
import { IconLabel } from '../../components/IconLabel'
import { ErrorState } from '../../components/states/ErrorState'
import { LoadingState } from '../../components/states/LoadingState'
import { useFilterState } from '../../hooks/useFilterState'
import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'
import { getErrorMessage, getErrorStatus } from '../../utils/apiErrors'
import { accessClient } from '../access/accessClient'
import { PaginationFooter } from '../access/PaginationFooter'
import { useAllPolicies } from '../access/useAllPolicies'
import { useAllRoles } from '../access/useAllRoles'

import { AssignRoleModal } from './AssignRoleModal'
import { fetchProjectRolesForPrincipal } from './projectRoleFallback'

const filterFieldDefinitions: FilterFieldDefinition[] = [
  {
    key: 'name',
    label: 'Name',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by name',
  },
]

interface PolicyInfo {
  name: string
  description: string | null
}

interface RoleAssignmentRow {
  id: string
  roleName: string
  roleDescription: string | null
  policies: PolicyInfo[]
  scope: string
  scopeType: 'system' | 'project'
  createdAt: string | null
  /** For project-scoped rows, the project + assignment IDs needed for deletion */
  projectId?: string
}

interface RoleAssignmentsPanelProps {
  principalType: 'user' | 'group'
  principalId: string
}

function UnassignRoleDialog({
  roleName,
  isOpen,
  onClose,
  onConfirm,
}: Readonly<{
  roleName: string | null
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
}>) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} variant="small">
      <ModalHeader title="Unassign role" />
      <ModalBody>Are you sure you want to unassign role &quot;{roleName}&quot;?</ModalBody>
      <ModalFooter>
        <Button variant="danger" onClick={onConfirm}>
          Unassign
        </Button>
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}

function getAssignmentActions(row: RoleAssignmentRow, onUnassign: (row: RoleAssignmentRow) => void): IAction[] {
  return [
    {
      title: <IconLabel icon={<RhUiTrashIcon />}>Unassign</IconLabel>,
      onClick: () => onUnassign(row),
    },
  ]
}

function RoleAssignmentsTable({
  rows,
  onUnassign,
}: Readonly<{
  rows: RoleAssignmentRow[]
  onUnassign: (row: RoleAssignmentRow) => void
}>) {
  return (
    <Table aria-label="Role assignments table" isStriped style={{ width: '100%' }}>
      <Thead>
        <Tr>
          <Th>Name</Th>
          <Th>Description</Th>
          <Th>Scope</Th>
          <Th>Policies</Th>
          <Th screenReaderText="Actions" />
        </Tr>
      </Thead>
      <Tbody>
        {rows.map((row) => (
          <Tr key={row.id}>
            <Td dataLabel="Name">{row.roleName}</Td>
            <Td dataLabel="Description">{row.roleDescription ?? '-'}</Td>
            <Td dataLabel="Scope">
              <Label isCompact color={row.scopeType === 'system' ? 'blue' : 'green'}>
                {row.scope}
              </Label>
            </Td>
            <Td dataLabel="Policies">
              {row.policies.length > 0 ? (
                <LabelGroup>
                  {row.policies.map((policy) => (
                    <Label key={policy.name} isCompact>
                      {policy.name}
                    </Label>
                  ))}
                </LabelGroup>
              ) : (
                '-'
              )}
            </Td>
            <Td isActionCell>
              <ActionsColumn items={getAssignmentActions(row, onUnassign)} />
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  )
}

function useRoleAssignmentData(principalType: 'user' | 'group', principalId: string) {
  // ── System-level queries (may 403 for non-admin users) ──────────────────
  const systemUserQuery = accessClient.useQuery('get', '/user-role-assignments', undefined, {
    enabled: principalType === 'user',
    retry: false,
  })
  const systemGroupQuery = accessClient.useQuery('get', '/group-role-assignments', undefined, {
    enabled: principalType === 'group',
    retry: false,
  })

  const activeSystemQuery = principalType === 'user' ? systemUserQuery : systemGroupQuery
  const systemQueryForbidden = useMemo(() => {
    if (!activeSystemQuery.isError) return false
    const status = getErrorStatus(activeSystemQuery.error)
    if (status === 403) return true
    const errBody = activeSystemQuery.error as { code?: string } | null
    return errBody?.code === 'AUTHORIZATION_DENIED'
  }, [activeSystemQuery.isError, activeSystemQuery.error])

  // ── Project-scoped fallback (when system query is forbidden) ────────────
  const projectFallbackQuery = useQuery({
    queryKey: ['project-role-fallback', principalType, principalId],
    queryFn: () => fetchProjectRolesForPrincipal(principalType, principalId),
    enabled: systemQueryForbidden,
  })

  const { roles: allRoles } = useAllRoles()
  const { policies: allPolicies } = useAllPolicies()

  // ── Build rows from system-level data (when available) ──────────────────
  const systemRows = useMemo((): RoleAssignmentRow[] => {
    if (systemQueryForbidden) return []

    const rolesData = allRoles
    const policyDescMap = new Map(allPolicies.map((p) => [p.name, p.description]))
    const roleMap = new Map(rolesData.map((r) => [r.name, r]))

    function buildRow(assignmentId: string, roleName: string, createdAt: string | null): RoleAssignmentRow {
      const role = roleMap.get(roleName)
      const policyNames = role?.policies ?? []
      return {
        id: assignmentId,
        roleName,
        roleDescription: role?.description ?? null,
        policies: policyNames.map((name) => ({ name, description: policyDescMap.get(name) ?? null })),
        scope: 'System',
        scopeType: 'system',
        createdAt,
      }
    }

    if (principalType === 'user') {
      return (systemUserQuery.data ?? [])
        .filter((a) => a.user_id === principalId)
        .map((a) => buildRow(a.id, a.role_name, a.created_at ?? null))
    }
    return (systemGroupQuery.data ?? [])
      .filter((a) => a.group_id === principalId)
      .map((a) => buildRow(a.id, a.role_name, a.created_at ?? null))
  }, [
    systemQueryForbidden,
    principalType,
    principalId,
    systemUserQuery.data,
    systemGroupQuery.data,
    allRoles,
    allPolicies,
  ])

  const rows = useMemo(() => {
    const projectRows = (projectFallbackQuery.data ?? []).map((row) => ({
      ...row,
      roleDescription: null,
      policies: [],
    }))
    return [...systemRows, ...projectRows]
  }, [systemRows, projectFallbackQuery.data])

  const { mutate: deleteUserAssignment } = accessClient.useMutation('delete', '/user-role-assignments/{assignment_id}')
  const { mutate: deleteGroupAssignment } = accessClient.useMutation(
    'delete',
    '/group-role-assignments/{assignment_id}'
  )
  const { mutate: deleteProjectUserRole } = accessClient.useMutation(
    'delete',
    '/projects/{project_id}/roles/{assignment_id}'
  )
  const { mutate: deleteProjectGroupRole } = accessClient.useMutation(
    'delete',
    '/projects/{project_id}/group-roles/{assignment_id}'
  )

  const deleteAssignment = (
    row: RoleAssignmentRow,
    callbacks: { onSuccess: () => void; onError: (err: unknown) => void; onSettled: () => void }
  ) => {
    if (row.projectId) {
      const mutate = principalType === 'user' ? deleteProjectUserRole : deleteProjectGroupRole
      mutate({ params: { path: { project_id: row.projectId, assignment_id: row.id } } }, callbacks)
    } else if (principalType === 'user') {
      deleteUserAssignment({ params: { path: { assignment_id: row.id } } }, callbacks)
    } else {
      deleteGroupAssignment({ params: { path: { assignment_id: row.id } } }, callbacks)
    }
  }

  const isLoading =
    (!systemQueryForbidden && activeSystemQuery.isPending) || (systemQueryForbidden && projectFallbackQuery.isPending)

  const refetch = () => {
    if (systemQueryForbidden) {
      projectFallbackQuery.refetch().catch(() => {})
    } else {
      activeSystemQuery.refetch().catch(() => {})
    }
  }

  return {
    rows,
    systemQueryForbidden,
    activeSystemQuery,
    isLoading,
    deleteAssignment,
    refetch,
  }
}

export function RoleAssignmentsPanel({ principalType, principalId }: Readonly<RoleAssignmentsPanelProps>) {
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [rowToUnassign, setRowToUnassign] = useState<RoleAssignmentRow | null>(null)
  const { filters, setAllFilters, clearAllFilters } = useFilterState()
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const { showAlert } = useAlerts()

  const { rows, systemQueryForbidden, activeSystemQuery, isLoading, deleteAssignment, refetch } = useRoleAssignmentData(
    principalType,
    principalId
  )

  const handleFilterChange = (newFilters: FilterConfig[]) => {
    setAllFilters(newFilters)
    setPage(1)
  }

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage)
    setPage(1)
  }

  const filteredRows = useMemo(() => {
    const nameFilter = filters.find((f) => f.key === 'name')
    if (!nameFilter) return rows
    const term = String(nameFilter.value).toLowerCase()
    return rows.filter((row) => row.roleName.toLowerCase().includes(term))
  }, [rows, filters])

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * perPage
    return filteredRows.slice(start, start + perPage)
  }, [filteredRows, page, perPage])

  const handleUnassign = () => {
    if (!rowToUnassign) return
    deleteAssignment(rowToUnassign, {
      onSuccess: () => {
        showAlert({
          title: 'Role unassigned',
          description: `Role "${rowToUnassign.roleName}" has been unassigned.`,
          variant: 'success',
          autoDismiss: true,
        })
        refetch()
      },
      onError: (err: unknown) => {
        showAlert({
          title: 'Failed to unassign role',
          description: getErrorMessage(err),
          variant: 'error',
          autoDismiss: true,
        })
      },
      onSettled: () => setRowToUnassign(null),
    })
  }

  // ── Loading / error states ──────────────────────────────────────────────
  if (activeSystemQuery.isError && !systemQueryForbidden) {
    return (
      <ErrorState
        title="Error loading role assignments"
        message={activeSystemQuery.error}
        onRetry={() => activeSystemQuery.refetch().catch(() => {})}
      />
    )
  }

  if (isLoading) return <LoadingState />

  if (rows.length === 0 && !systemQueryForbidden) {
    return (
      <>
        <EmptyStateNoData
          title="No role assignments"
          description={`No roles have been assigned to this ${principalType}.`}
          buttonText="Assign role"
          addData={() => setAssignModalOpen(true)}
        />
        <AssignRoleModal
          principalType={principalType}
          principalId={principalId}
          isOpen={assignModalOpen}
          onClose={() => setAssignModalOpen(false)}
          onSuccess={refetch}
        />
      </>
    )
  }

  let tableContent: ReactNode
  if (filteredRows.length === 0) {
    if (rows.length === 0) {
      tableContent = (
        <StackItem isFilled style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <EmptyStateNoData
            title="No role assignments"
            description={`No project-scoped roles have been assigned to this ${principalType}.`}
            buttonText="Assign role"
            addData={() => setAssignModalOpen(true)}
          />
        </StackItem>
      )
    } else {
      tableContent = (
        <StackItem isFilled style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <EmptyStateFilter
            clearAllFilters={() => {
              clearAllFilters()
              setPage(1)
            }}
          />
        </StackItem>
      )
    }
  } else {
    tableContent = (
      <StackItem isFilled style={{ minHeight: 0, overflow: 'auto' }}>
        <RoleAssignmentsTable rows={paginatedRows} onUnassign={setRowToUnassign} />
      </StackItem>
    )
  }

  return (
    <>
      <Stack style={{ height: '100%' }}>
        {systemQueryForbidden && (
          <StackItem>
            <Alert
              variant="info"
              isInline
              title="Showing project-scoped roles only"
              style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}
            >
              System-level role assignments require administrator access. Only roles within your accessible projects are
              shown.
            </Alert>
          </StackItem>
        )}

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
              <Button variant="primary" icon={<PlusIcon />} onClick={() => setAssignModalOpen(true)}>
                Assign role
              </Button>
            </FlexItem>
          </Flex>
        </StackItem>

        {tableContent}

        <PaginationFooter
          page={page}
          perPage={perPage}
          total={filteredRows.length}
          hasNext={page * perPage < filteredRows.length}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => p + 1)}
          onPerPageChange={handlePerPageChange}
        />
      </Stack>

      <AssignRoleModal
        principalType={principalType}
        principalId={principalId}
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        onSuccess={refetch}
      />

      <UnassignRoleDialog
        roleName={rowToUnassign?.roleName ?? null}
        isOpen={!!rowToUnassign}
        onClose={() => setRowToUnassign(null)}
        onConfirm={handleUnassign}
      />
    </>
  )
}
