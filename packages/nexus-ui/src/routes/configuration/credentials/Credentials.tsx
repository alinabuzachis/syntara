import { Button, StackItem } from '@patternfly/react-core'
import { RhUiEditIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { Th, Thead, Tr } from '@patternfly/react-table'
import { useCallback, useMemo, useState } from 'react'

import { credentialsClient } from '../../../client'
import { DisabledWithTooltip } from '../../../components/DisabledWithTooltip'
import { FilterBar } from '../../../components/filters/FilterBar'
import { IconLabel } from '../../../components/IconLabel'
import { NxPage, NxPageBody } from '../../../components/layout/NxPage'
import { NxPageHeader } from '../../../components/layout/NxPageHeader'
import { NxPanel } from '../../../components/layout/NxPanel'
import { NxPanelContentStack } from '../../../components/layout/NxPanelContentStack'
import { NxEmptyStateFilter } from '../../../components/states/NxEmptyStateFilter'
import { useQueryState } from '../../../components/states/useQueryState'
import { NxScrollableTableContainer } from '../../../components/table/NxScrollableTableContainer'
import { useCursorPagination, useCursorReset } from '../../../hooks/useCursorPagination'
import { useDeleteAction } from '../../../hooks/useDeleteAction'
import { useProjectSelector } from '../../../hooks/useProjectSelector'
import { useTableSort } from '../../../hooks/useTableSort'
import { useAlerts } from '../../../providers/alerts'
import type { FilterFieldDefinition } from '../../../types/filters'
import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'

import type { Credential, CredentialExtended, CredentialType } from './credentialConstants'
import { CredentialEmptyState } from './CredentialEmptyState'
import { getCredentialNameFilterDefinition } from './credentialFilters'
import { FlatCredentialsTableBody, GroupedCredentialsTableBody, type CredentialRowAction } from './CredentialsTableBody'
import { DeleteCredentialDialog } from './DeleteCredentialDialog'
import { DisableCredentialDialog } from './DisableCredentialDialog'
import { CredentialFormModal } from './form/CredentialFormModal'
import { useCredentialPermissions } from './useCredentialPermissions'
import { useDeleteCredentialState } from './useDeleteCredentialState'
import { useDisableCredentialState } from './useDisableCredentialState'

function buildCredentialRowActions(
  credential: Credential,
  permissions: ReturnType<typeof useCredentialPermissions>,
  callbacks: {
    onEdit: (credential: Credential) => void
    onDelete: (credential: Credential) => void
  }
): CredentialRowAction[] {
  const noUpdate = permissions.canUpdate ? undefined : { content: permissions.tooltips.update }
  const noDelete = permissions.canDelete ? undefined : { content: permissions.tooltips.delete }
  return [
    {
      key: 'edit',
      title: <IconLabel icon={<RhUiEditIcon />}>Edit credential</IconLabel>,
      isAriaDisabled: !permissions.canUpdate,
      tooltipProps: noUpdate,
      onClick: () => callbacks.onEdit(credential),
    },
    { key: 'sep-delete', isSeparator: true },
    {
      key: 'delete',
      title: <IconLabel icon={<RhUiTrashIcon />}>Delete credential</IconLabel>,
      isDanger: true,
      isAriaDisabled: !permissions.canDelete,
      tooltipProps: noDelete,
      onClick: () => callbacks.onDelete(credential),
    },
  ]
}

// eslint-disable-next-line max-lines-per-function, sonarjs/cognitive-complexity -- pre-existing complexity
export default function Credentials() {
  const { showAlert } = useAlerts()
  const { selectedProject, isAllProjects, projects, ProjectSelector } = useProjectSelector()
  const permissions = useCredentialPermissions()

  const {
    cursor,
    filters,
    hasActiveFilters,
    queryParams,
    handleFilterChange,
    handleClearAllFilters,
    resetPagination,
    getFooterProps,
  } = useCursorPagination({
    extraParams: selectedProject?.id ? { project_id: selectedProject.id } : undefined,
  })

  // UI state
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [credentialToEdit, setCredentialToEdit] = useState<Credential | null>(null)
  const {
    credentialToDelete,
    affectedWorkflows: deleteAffectedWorkflows,
    workflowsFetchError: deleteWorkflowsFetchError,
    isLoadingWorkflows: deleteIsLoadingWorkflows,
    openDeleteDialog,
    closeDeleteDialog,
  } = useDeleteCredentialState()
  const filterFieldDefinitions = useMemo<FilterFieldDefinition[]>(() => [getCredentialNameFilterDefinition()], [])

  // Fetch credentials
  const query = credentialsClient.useQuery('get', '/credentials', { params: { query: queryParams } })
  // Cast to extended type - backend returns workflow_count but contract doesn't declare it
  const credentials = (query.data?.resources ?? []) as CredentialExtended[]

  useCursorReset(credentials.length, hasActiveFilters, cursor, query.isFetching, resetPagination)

  // Fetch credential types for type name lookup
  const typesQuery = credentialsClient.useQuery('get', '/credential_types')
  const typeMap = useMemo(() => {
    const map = new Map<string, CredentialType>()
    for (const t of typesQuery.data?.resources ?? []) {
      map.set(t.id!, t)
    }
    return map
  }, [typesQuery.data])

  // Sorting
  const { activeSortIndex, getSortParams, sortData } = useTableSort({
    initialSortIndex: 0,
    initialDirection: 'asc',
  })

  const results = sortData(credentials, (cred) => {
    switch (activeSortIndex) {
      case 0:
        return cred.name ?? ''
      case 1:
        return typeMap.get(cred.credential_type_id)?.name ?? ''
      case 2:
        return cred.workflow_count ?? 0
      case 3:
        return cred.created_at ?? ''
      case 4:
        return cred.updated_at ?? ''
      case 5:
        return cred.enabled ? 1 : 0
      default:
        return cred.name ?? ''
    }
  })

  // Expandable row state
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const expandableCredentialIds = useMemo(
    () => results.filter((c) => Boolean(c.description?.trim())).map((c) => c.id!),
    [results]
  )

  const areAllExpanded = useMemo(
    () => expandableCredentialIds.length > 0 && expandableCredentialIds.every((id) => expandedRows.has(id)),
    [expandableCredentialIds, expandedRows]
  )

  const handleToggleRow = useCallback((credentialId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(credentialId)) {
        next.delete(credentialId)
      } else {
        next.add(credentialId)
      }
      return next
    })
  }, [])

  const handleToggleAllRows = useCallback(() => {
    if (areAllExpanded) {
      setExpandedRows(new Set())
    } else {
      setExpandedRows(new Set(expandableCredentialIds))
    }
  }, [areAllExpanded, expandableCredentialIds])

  // Group credentials by project when viewing all projects
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())

  const groupedCredentials = useMemo(() => {
    if (!isAllProjects) return null
    const groups = new Map<string, { project: (typeof projects)[number] | null; credentials: CredentialExtended[] }>()
    for (const credential of results) {
      const projectId = credential.project_id ?? 'unknown'
      if (!groups.has(projectId)) {
        groups.set(projectId, {
          project: projects.find((p) => p.id === projectId) ?? null,
          credentials: [],
        })
      }
      groups.get(projectId)!.credentials.push(credential)
    }
    return groups
  }, [results, projects, isAllProjects])

  const toggleProjectCollapsed = (projectId: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }
      return next
    })
  }

  // Mutations
  const { mutate: patchCredential, isPending: isPatchPending } = credentialsClient.useMutation(
    'patch',
    '/credentials/{credential_id}'
  )
  const { mutate: deleteCredential, isPending: isDeletePending } = credentialsClient.useMutation(
    'delete',
    '/credentials/{credential_id}'
  )

  // Disable credential dialog state
  const {
    credentialToDisable,
    affectedWorkflows,
    workflowsFetchError,
    isLoadingWorkflows: disableIsLoadingWorkflows,
    openDisableDialog,
    closeDisableDialog,
  } = useDisableCredentialState()

  function handleToggleEnabled(credential: Credential) {
    if (credential.enabled) {
      openDisableDialog(credential)
    } else {
      patchCredential(
        { params: { path: { credential_id: credential.id! } }, body: { enabled: true } },
        {
          onSuccess: () => {
            detachPromise(query.refetch())
          },
          onError: (error: unknown) => {
            showAlert({
              title: 'Failed to enable credential',
              description: getErrorMessage(error),
              variant: 'danger',
              autoDismiss: true,
            })
          },
        }
      )
    }
  }

  function handleConfirmDisable() {
    if (!credentialToDisable) return
    patchCredential(
      { params: { path: { credential_id: credentialToDisable.id! } }, body: { enabled: false } },
      {
        onSuccess: () => {
          detachPromise(query.refetch())
        },
        onError: (error: unknown) => {
          showAlert({
            title: 'Failed to disable credential',
            description: getErrorMessage(error),
            variant: 'danger',
            autoDismiss: true,
          })
        },
        onSettled: closeDisableDialog,
      }
    )
  }

  const handleConfirmDelete = useDeleteAction<Credential, { params: { path: { credential_id: string } } }>({
    deleteFn: (params, callbacks) => deleteCredential(params, callbacks),
    buildParams: (cred) => ({ params: { path: { credential_id: cred.id! } } }),
    entityLabel: 'credential',
    getItemName: (cred) => cred.name,
    onSuccess: () => detachPromise(query.refetch()),
    onSettled: closeDeleteDialog,
  })

  const toggleTooltip = permissions.canUpdate ? undefined : permissions.tooltips.enable

  const getRowActions = (credential: Credential) =>
    buildCredentialRowActions(credential, permissions, {
      onEdit: setCredentialToEdit,
      onDelete: openDeleteDialog,
    })

  // Query state handling (loading/error)
  const queryState = useQueryState(query, {
    title: 'Error loading credentials',
    onRetry: () => detachPromise(query.refetch()),
  })
  if (queryState) {
    return (
      <NxPage>
        <NxPageHeader title="Credentials" projectSelector={ProjectSelector} />
        <NxPageBody>
          <NxPanel isFullHeight>{queryState}</NxPanel>
        </NxPageBody>
      </NxPage>
    )
  }

  return (
    <NxPage>
      <NxPageHeader
        title="Credentials"
        projectSelector={ProjectSelector}
        toolbar={
          results.length > 0 || hasActiveFilters ? (
            <DisabledWithTooltip isDisabled={!permissions.canCreate} content={permissions.tooltips.create}>
              <Button
                variant="primary"
                isAriaDisabled={!permissions.canCreate}
                onClick={() => setCreateModalOpen(true)}
              >
                Create credential
              </Button>
            </DisabledWithTooltip>
          ) : undefined
        }
      />

      {results.length === 0 && !hasActiveFilters ? (
        <NxPageBody>
          <NxPanel isFullHeight>
            <CredentialEmptyState
              onCreateCredential={permissions.canCreate ? () => setCreateModalOpen(true) : undefined}
            />
          </NxPanel>
        </NxPageBody>
      ) : (
        <NxPageBody>
          <NxPanel isFullHeight>
            <NxPanelContentStack>
              <StackItem>
                <FilterBar
                  fieldDefinitions={filterFieldDefinitions}
                  filters={filters}
                  onFilterChange={handleFilterChange}
                  showClearAll={true}
                />
              </StackItem>

              {results.length === 0 ? (
                <NxPageBody isCentered>
                  <NxEmptyStateFilter clearAllFilters={handleClearAllFilters} />
                </NxPageBody>
              ) : (
                <NxScrollableTableContainer
                  isExpandable
                  aria-label="Credentials table"
                  footer={getFooterProps(query.data)}
                >
                  <Thead>
                    <Tr>
                      <Th
                        expand={{
                          areAllExpanded,
                          collapseAllAriaLabel: areAllExpanded ? 'Collapse all' : 'Expand all',
                          onToggle: handleToggleAllRows,
                        }}
                        aria-label="Row expansion"
                      />
                      <Th sort={getSortParams(0)}>Name</Th>
                      <Th sort={getSortParams(1)}>Type</Th>
                      <Th sort={getSortParams(2)}>Workflows</Th>
                      <Th sort={getSortParams(3)}>Created</Th>
                      <Th sort={getSortParams(4)}>Last modified</Th>
                      <Th sort={getSortParams(5)}>State</Th>
                      <Th screenReaderText="Actions" />
                    </Tr>
                  </Thead>
                  {isAllProjects && groupedCredentials ? (
                    <GroupedCredentialsTableBody
                      groupedCredentials={groupedCredentials}
                      collapsedProjects={collapsedProjects}
                      onToggleProject={toggleProjectCollapsed}
                      typeMap={typeMap}
                      expandedRows={expandedRows}
                      onToggleRow={handleToggleRow}
                      getRowActions={getRowActions}
                      onToggleEnabled={handleToggleEnabled}
                      toggleDisabledTooltip={toggleTooltip}
                    />
                  ) : (
                    <FlatCredentialsTableBody
                      credentials={results}
                      typeMap={typeMap}
                      expandedRows={expandedRows}
                      onToggleRow={handleToggleRow}
                      getRowActions={getRowActions}
                      onToggleEnabled={handleToggleEnabled}
                      toggleDisabledTooltip={toggleTooltip}
                    />
                  )}
                </NxScrollableTableContainer>
              )}
            </NxPanelContentStack>
          </NxPanel>
        </NxPageBody>
      )}

      <DisableCredentialDialog
        credential={credentialToDisable}
        affectedWorkflows={affectedWorkflows}
        workflowsFetchError={workflowsFetchError}
        isLoadingWorkflows={disableIsLoadingWorkflows}
        isLoading={isPatchPending}
        onConfirm={handleConfirmDisable}
        onClose={closeDisableDialog}
      />

      <DeleteCredentialDialog
        credential={credentialToDelete}
        affectedWorkflows={deleteAffectedWorkflows}
        workflowsFetchError={deleteWorkflowsFetchError}
        isLoadingWorkflows={deleteIsLoadingWorkflows}
        isLoading={isDeletePending}
        onConfirm={() => handleConfirmDelete(credentialToDelete)}
        onClose={closeDeleteDialog}
      />

      <CredentialFormModal
        isOpen={createModalOpen || !!credentialToEdit}
        onClose={() => {
          setCreateModalOpen(false)
          setCredentialToEdit(null)
        }}
        credentialToEdit={credentialToEdit}
        onSuccess={() => detachPromise(query.refetch())}
        defaultProjectId={selectedProject?.id}
      />
    </NxPage>
  )
}
