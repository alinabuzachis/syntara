import {
  Button,
  Label,
  LabelGroup,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Flex,
  FlexItem,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import { PlusIcon, RhUiEditFillIcon, RhUiLockIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction, ThProps } from '@patternfly/react-table'
import { useMemo, useState } from 'react'

import { useAlerts } from '../../components/alerts'
import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { FilterBar } from '../../components/filters'
import { IconLabel } from '../../components/IconLabel'
import { useQueryState } from '../../components/states/useQueryState'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'
import { getErrorMessage } from '../../utils/apiErrors'
import { buildFilterParams } from '../../utils/filterUtils'

import { accessClient } from './accessClient'
import { AddRoleDialog } from './AddRoleDialog'
import { EditRoleDialog } from './EditRoleDialog'
import { PaginationFooter } from './PaginationFooter'
import { buildFilterDefsWithScope, transformFiltersForApi } from './scopeFilterUtils'
import { ScopeLabel } from './ScopeLabel'
import type { RoleRead } from './types'
import { useBuiltinListState } from './useBuiltinListState'
import { useProjectNameMap } from './useProjectNameMap'

const BASE_FILTER_FIELD_DEFS = [
  {
    key: 'name',
    label: 'Name',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by name',
  },
  {
    key: 'scope',
    label: 'Scope',
    type: FilterTypeEnum.SELECT,
    options: [],
    placeholder: 'Filter by scope',
  },
  {
    key: 'type',
    label: 'Type',
    type: FilterTypeEnum.SELECT,
    options: [
      { value: 'builtin', label: 'Built-in' },
      { value: 'custom', label: 'Custom' },
    ],
    placeholder: 'Filter by type',
  },
]

// Column index → API sort field
const sortFieldByColumn: Record<number, string> = {
  0: 'name',
  4: 'is_builtin',
}

function RolesTable({
  roles,
  projectNameMap,
  getSortParams,
  onEdit,
  onDelete,
}: Readonly<{
  roles: RoleRead[]
  projectNameMap: Map<string, string>
  getSortParams: (columnIndex: number) => ThProps['sort']
  onEdit: (role: RoleRead) => void
  onDelete: (role: RoleRead) => void
}>) {
  const getRoleActions = (role: RoleRead): IAction[] => [
    {
      title: <IconLabel icon={<RhUiEditFillIcon />}>Edit role</IconLabel>,
      onClick: () => onEdit(role),
    },
    { isSeparator: true },
    {
      title: <IconLabel icon={<RhUiTrashIcon />}>Delete role</IconLabel>,
      onClick: () => onDelete(role),
    },
  ]

  return (
    <Table aria-label="Roles" isStriped style={{ width: '100%' }}>
      <Thead>
        <Tr>
          <Th sort={getSortParams(0)}>Name</Th>
          <Th>Description</Th>
          <Th>Policies</Th>
          <Th modifier="nowrap">Scope</Th>
          <Th sort={getSortParams(4)} modifier="nowrap">
            Type
          </Th>
          <Th screenReaderText="Actions" />
        </Tr>
      </Thead>
      <Tbody>
        {roles.map((role) => (
          <Tr key={role.id}>
            <Td dataLabel="Name">{role.name}</Td>
            <Td dataLabel="Description">{role.description ?? '-'}</Td>
            <Td dataLabel="Policies">
              <LabelGroup isCompact numLabels={5}>
                {(role.policies ?? []).map((policy) => (
                  <Label key={policy} color="grey" isCompact>
                    {policy}
                  </Label>
                ))}
              </LabelGroup>
            </Td>
            <Td dataLabel="Scope">
              <ScopeLabel projectId={role.project_id} projectNameMap={projectNameMap} />
            </Td>
            <Td dataLabel="Type">
              {role.is_builtin ? (
                <Label color="yellow" icon={<RhUiLockIcon />} isCompact>
                  Built-in
                </Label>
              ) : (
                <Label color="blue" isCompact>
                  Custom
                </Label>
              )}
            </Td>
            <Td isActionCell>{!role.is_builtin && <ActionsColumn items={getRoleActions(role)} />}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  )
}

export function RolesTab() {
  const {
    filters,
    hasActiveFilters,
    handleFilterChange,
    clearAllFilters,
    getSortParams,
    queryParams: baseQueryParams,
    page,
    perPage,
    handlePerPageChange,
    goToPrevPage,
    goToNextPage,
  } = useBuiltinListState(sortFieldByColumn)
  const [roleToEdit, setRoleToEdit] = useState<RoleRead | null>(null)
  const [roleToDelete, setRoleToDelete] = useState<RoleRead | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const { showSuccess, showError } = useAlerts()

  // Fetch projects to resolve project names in the scope column/filter.
  const { projectNameMap } = useProjectNameMap()

  const filterFieldDefinitions = useMemo(
    () => buildFilterDefsWithScope([...BASE_FILTER_FIELD_DEFS], projectNameMap),
    [projectNameMap]
  )

  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = { limit: baseQueryParams.limit, include_total: true }
    if (typeof baseQueryParams.cursor === 'string') params.cursor = baseQueryParams.cursor
    if (typeof baseQueryParams.sort === 'string') params.sort = baseQueryParams.sort
    Object.assign(params, buildFilterParams(transformFiltersForApi(filters)))
    return params
  }, [baseQueryParams, filters])

  const rolesQuery = accessClient.useQuery('get', '/roles', {
    params: { query: queryParams },
  })

  const roles = rolesQuery.data?.resources ?? []

  const { mutate: deleteRole } = accessClient.useMutation('delete', '/roles/{role_id}')

  const handleRolesChanged = () => {
    rolesQuery.refetch().catch(() => {})
  }

  const handleDelete = () => {
    if (!roleToDelete) return
    deleteRole(
      { params: { path: { role_id: roleToDelete.id } } },
      {
        onSuccess: () => {
          showSuccess(`Deleted role "${roleToDelete.name}"`, 'Role Deleted')
          handleRolesChanged()
        },
        onError: (error) => {
          showError(getErrorMessage(error), 'Failed to Delete Role')
        },
        onSettled: () => setRoleToDelete(null),
      }
    )
  }

  // Loading/error states
  const queryState = useQueryState(rolesQuery, {
    title: 'Error loading roles',
    onRetry: () => rolesQuery.refetch(),
  })

  if (queryState) {
    return (
      <>
        {queryState}
        {isAddDialogOpen && <AddRoleDialog onClose={() => setIsAddDialogOpen(false)} onSuccess={handleRolesChanged} />}
      </>
    )
  }

  if (roles.length === 0 && !hasActiveFilters) {
    return (
      <>
        <EmptyStateNoData title="No roles found" description="No roles are available." />
        {isAddDialogOpen && <AddRoleDialog onClose={() => setIsAddDialogOpen(false)} onSuccess={handleRolesChanged} />}
      </>
    )
  }

  return (
    <>
      <Stack style={{ height: '100%' }}>
        <StackItem>
          <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
            <FlexItem grow={{ default: 'grow' }}>
              <FilterBar
                fieldDefinitions={filterFieldDefinitions}
                filters={filters}
                onFilterChange={handleFilterChange}
                showClearAll={true}
                clearAllFilters={clearAllFilters}
              />
            </FlexItem>
            <FlexItem>
              <Button variant="primary" icon={<PlusIcon />} onClick={() => setIsAddDialogOpen(true)}>
                Add role
              </Button>
            </FlexItem>
          </Flex>
        </StackItem>

        {roles.length === 0 ? (
          <StackItem isFilled style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EmptyStateFilter clearAllFilters={clearAllFilters} />
          </StackItem>
        ) : (
          <StackItem isFilled style={{ minHeight: 0, overflow: 'auto' }}>
            <RolesTable
              roles={roles}
              projectNameMap={projectNameMap}
              getSortParams={getSortParams}
              onEdit={setRoleToEdit}
              onDelete={setRoleToDelete}
            />
          </StackItem>
        )}

        <PaginationFooter
          page={page}
          perPage={perPage}
          total={rolesQuery.data?.total}
          hasNext={!!rolesQuery.data?.next}
          onPrev={goToPrevPage}
          onNext={() => goToNextPage(rolesQuery.data?.next ?? null)}
          onPerPageChange={handlePerPageChange}
        />
      </Stack>

      {isAddDialogOpen && <AddRoleDialog onClose={() => setIsAddDialogOpen(false)} onSuccess={handleRolesChanged} />}

      {roleToEdit && (
        <EditRoleDialog role={roleToEdit} onClose={() => setRoleToEdit(null)} onSuccess={handleRolesChanged} />
      )}

      <Modal isOpen={!!roleToDelete} onClose={() => setRoleToDelete(null)} variant="small">
        <ModalHeader title="Delete role?" titleIconVariant="warning" />
        <ModalBody>
          Permanently delete role <strong>{roleToDelete?.name}</strong>? Any assignments using this role will lose
          access.
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setRoleToDelete(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            Delete
          </Button>
        </ModalFooter>
      </Modal>
    </>
  )
}
