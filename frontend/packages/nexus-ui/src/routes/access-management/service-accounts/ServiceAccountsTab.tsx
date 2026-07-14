import { Button, Content, Switch, Truncate } from '@patternfly/react-core'
import { RhUiAddIcon, RhUiEditFillIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useCallback, useMemo } from 'react'

import { NxConfirmationDialog } from '../../../components/dialogs/NxConfirmationDialog'
import { DisabledWithTooltip } from '../../../components/DisabledWithTooltip'
import { IconLabel } from '../../../components/IconLabel'
import type { KebabAction } from '../../../components/NxKebabMenu'
import { NxKebabMenu } from '../../../components/NxKebabMenu'
import { NxListPanelTable, NxListPanelToolbar, NxListPanelView } from '../../../components/panels/list/NxListPanel'
import { NxEmptyStateNoData } from '../../../components/states/NxEmptyStateNoData'
import { Link } from '../../../hooks/routing/Link'
import { useCursorPagination, useCursorReset } from '../../../hooks/useCursorPagination'
import { useDeleteAction } from '../../../hooks/useDeleteAction'
import { useDialogState } from '../../../hooks/useDialogState'
import { useMutationErrorHandler } from '../../../hooks/useMutationErrorHandler'
import { useTableSort } from '../../../hooks/useTableSort'
import { FilterOperatorEnum, FilterTypeEnum } from '../../../types/filters'
import type { FilterFieldDefinition } from '../../../types/filters'
import { formatDateTime } from '../../../utils/dateUtils'
import { detachPromise } from '../../../utils/detachPromise'
import { accessClient } from '../../access/accessClient'
import { getServiceAccountDetailPath } from '../accessManagementPaths'

import { CreateServiceAccountModal } from './CreateServiceAccountModal'
import { EditServiceAccountModal } from './EditServiceAccountModal'
import type { ServiceAccountRead } from './serviceAccountTypes'
import { useServiceAccountPermissions } from './useServiceAccountPermissions'

const SORT_FIELDS = ['name', 'created_at', 'last_authenticated_at'] as const

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
    key: 'status',
    label: 'Status',
    type: FilterTypeEnum.SELECT,
    operators: [FilterOperatorEnum.EQ],
    defaultOperator: FilterOperatorEnum.EQ,
    options: [
      { label: 'Enabled', value: 'active' },
      { label: 'Disabled', value: 'disabled' },
    ],
  },
]

function getRowActions(
  sa: ServiceAccountRead,
  onEdit: (sa: ServiceAccountRead) => void,
  onDelete: (sa: ServiceAccountRead) => void,
  permissions: ReturnType<typeof useServiceAccountPermissions>
): KebabAction[] {
  return [
    {
      key: 'edit',
      title: <IconLabel icon={<RhUiEditFillIcon />}>Edit service account</IconLabel>,
      isAriaDisabled: !permissions.canUpdate,
      tooltipProps: permissions.canUpdate ? undefined : { content: permissions.tooltips.update },
      onClick: () => onEdit(sa),
    },
    { key: 'separator', isSeparator: true },
    {
      key: 'delete',
      title: <IconLabel icon={<RhUiTrashIcon />}>Delete service account</IconLabel>,
      isDanger: true,
      isAriaDisabled: !permissions.canDelete,
      tooltipProps: permissions.canDelete ? undefined : { content: permissions.tooltips.delete },
      onClick: () => onDelete(sa),
    },
  ]
}

function ServiceAccountTableBody({
  serviceAccounts,
  permissions,
  onToggleStatus,
  onEdit,
  onDelete,
}: Readonly<{
  serviceAccounts: ServiceAccountRead[]
  permissions: ReturnType<typeof useServiceAccountPermissions>
  onToggleStatus: (sa: ServiceAccountRead) => void
  onEdit: (sa: ServiceAccountRead) => void
  onDelete: (sa: ServiceAccountRead) => void
}>) {
  return (
    <Tbody>
      {serviceAccounts.map((sa) => (
        <Tr key={sa.id}>
          <Td dataLabel="Name">
            <Link href={getServiceAccountDetailPath(sa.id)}>
              <Truncate content={sa.name} />
            </Link>
          </Td>
          <Td dataLabel="Created">{formatDateTime(sa.created_at)}</Td>
          <Td dataLabel="Last authenticated">
            {sa.last_authenticated_at ? formatDateTime(sa.last_authenticated_at) : 'Never'}
          </Td>
          <Td dataLabel="State">
            <Switch
              id={`sa-toggle-${sa.id}`}
              label={sa.status === 'active' ? 'Enabled' : 'Disabled'}
              isChecked={sa.status === 'active'}
              onChange={permissions.canUpdate ? () => onToggleStatus(sa) : undefined}
              aria-label={`Toggle ${sa.name} status`}
              aria-disabled={!permissions.canUpdate || undefined}
            />
          </Td>
          <Td isActionCell>
            <NxKebabMenu
              actions={getRowActions(sa, onEdit, onDelete, permissions)}
              aria-label={`Actions for ${sa.name}`}
            />
          </Td>
        </Tr>
      ))}
    </Tbody>
  )
}

export function ServiceAccountsTab() {
  const permissions = useServiceAccountPermissions()

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

  const { activeSortIndex, sortDirection, getSortParams } = useTableSort({
    initialDirection: 'asc',
  })

  const finalQueryParams = useMemo(() => {
    const field = SORT_FIELDS[activeSortIndex] ?? 'name'
    const sort = sortDirection === 'desc' ? `-${field}` : field
    return { ...queryParams, sort }
  }, [activeSortIndex, sortDirection, queryParams])

  const query = accessClient.useQuery('get', '/service_accounts', {
    params: { query: finalQueryParams },
  })
  const serviceAccounts = query.data?.resources ?? []
  const refetch = useCallback(() => detachPromise(query.refetch()), [query])

  useCursorReset(serviceAccounts.length, hasActiveFilters, cursor, query.isFetching, resetPagination)

  const createDialog = useDialogState()
  const deleteDialog = useDialogState<ServiceAccountRead>()
  const editDialog = useDialogState<ServiceAccountRead>()
  const disableDialog = useDialogState<ServiceAccountRead>()

  const { mutate: deleteServiceAccount } = accessClient.useMutation('delete', '/service_accounts/{service_account_id}')

  const handleDelete = useDeleteAction({
    deleteFn: deleteServiceAccount,
    buildParams: (sa: ServiceAccountRead) => ({ params: { path: { service_account_id: sa.id } } }),
    entityLabel: 'service account',
    getItemName: (sa: ServiceAccountRead) => sa.name,
    onSuccess: refetch,
    onSettled: deleteDialog.close,
  })

  const handleMutationError = useMutationErrorHandler()

  const { mutate: enableServiceAccount } = accessClient.useMutation(
    'post',
    '/service_accounts/{service_account_id}/enable'
  )
  const { mutate: disableServiceAccount } = accessClient.useMutation(
    'post',
    '/service_accounts/{service_account_id}/disable'
  )

  const handleToggleStatus = useCallback(
    (sa: ServiceAccountRead) => {
      if (sa.status === 'active') {
        disableDialog.open(sa)
        return
      }
      enableServiceAccount(
        { params: { path: { service_account_id: sa.id } } },
        {
          onSuccess: () => detachPromise(query.refetch()),
          onError: handleMutationError({ title: 'Failed to enable service account' }),
        }
      )
    },
    [query, enableServiceAccount, disableDialog, handleMutationError]
  )

  const handleDisable = useCallback(() => {
    const sa = disableDialog.item
    if (!sa) return
    disableServiceAccount(
      { params: { path: { service_account_id: sa.id } } },
      {
        onSuccess: () => detachPromise(query.refetch()),
        onError: handleMutationError({ title: 'Failed to disable service account' }),
        onSettled: () => disableDialog.close(),
      }
    )
  }, [disableServiceAccount, disableDialog, query, handleMutationError])

  return (
    <>
      <NxListPanelView
        tabKey="service-accounts"
        tabLabel="Service Accounts"
        isPending={query.isPending}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={refetch}
        isEmpty={serviceAccounts.length === 0}
        hasActiveFilters={hasActiveFilters}
        onClearAllFilters={handleClearAllFilters}
        noDataState={
          <NxEmptyStateNoData
            title="No service accounts yet"
            description="Service accounts provide programmatic access for external applications using OAuth 2.0 client credentials."
            buttonText="Create service account"
            addData={permissions.canCreate ? () => createDialog.open(undefined) : undefined}
          />
        }
        toolbar={
          serviceAccounts.length > 0 || hasActiveFilters ? (
            <NxListPanelToolbar
              filters={filters}
              filterDefinitions={filterFieldDefinitions}
              onFilterChange={handleFilterChange}
              clearAllFilters={handleClearAllFilters}
              actions={
                <DisabledWithTooltip isDisabled={!permissions.canCreate} content={permissions.tooltips.create}>
                  <Button
                    variant="primary"
                    icon={<RhUiAddIcon />}
                    isAriaDisabled={!permissions.canCreate}
                    onClick={permissions.canCreate ? () => createDialog.open(undefined) : undefined}
                  >
                    Create service account
                  </Button>
                </DisabledWithTooltip>
              }
            />
          ) : undefined
        }
        body={
          <>
            <Content>
              Service accounts provide programmatic access for external applications using OAuth 2.0 client credentials.
            </Content>
            <NxListPanelTable caption="Service accounts" footer={getFooterProps(query.data)}>
              <Thead>
                <Tr>
                  <Th sort={getSortParams(0)}>Name</Th>
                  <Th sort={getSortParams(1)}>Created</Th>
                  <Th sort={getSortParams(2)}>Last authenticated</Th>
                  <Th>State</Th>
                  <Th screenReaderText="Actions" />
                </Tr>
              </Thead>
              <ServiceAccountTableBody
                serviceAccounts={serviceAccounts}
                permissions={permissions}
                onToggleStatus={handleToggleStatus}
                onEdit={editDialog.open}
                onDelete={deleteDialog.open}
              />
            </NxListPanelTable>
          </>
        }
      />

      <CreateServiceAccountModal isOpen={createDialog.isOpen} onClose={createDialog.close} onSuccess={refetch} />

      {editDialog.item && (
        <EditServiceAccountModal
          serviceAccount={editDialog.item}
          isOpen={editDialog.isOpen}
          onClose={editDialog.close}
          onSuccess={refetch}
        />
      )}

      <NxConfirmationDialog
        isOpen={deleteDialog.isOpen}
        onClose={deleteDialog.close}
        onConfirm={() => handleDelete(deleteDialog.item)}
        title="Delete service account?"
        confirmLabel="Delete"
        confirmVariant="danger"
        titleIconVariant="warning"
        destructiveAcknowledgement={{
          checkboxId: 'delete-service-account-ack',
          label: 'I understand this service account will be permanently deleted and all OAuth tokens revoked.',
        }}
      >
        The service account <strong>{deleteDialog.item?.name}</strong> will be deleted. This cannot be undone.
      </NxConfirmationDialog>

      <NxConfirmationDialog
        isOpen={disableDialog.isOpen}
        onClose={disableDialog.close}
        onConfirm={handleDisable}
        title="Disable service account?"
        confirmLabel="Disable"
        confirmVariant="primary"
      >
        You are about to disable the service account <strong>{disableDialog.item?.name}</strong>. You can re-enable the
        service account at any time.
      </NxConfirmationDialog>
    </>
  )
}
