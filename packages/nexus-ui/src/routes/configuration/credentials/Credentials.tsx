import { Button, Content, ContentVariants, StackItem } from '@patternfly/react-core'
import { RhUiEditIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { useMemo, useState } from 'react'

import { AppPage, AppPageMain } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { credentialsClient } from '../../../client'
import { useAlerts } from '../../../components/alerts'
import { AppPanel } from '../../../components/AppPanel'
import { EmptyStateFilter } from '../../../components/EmptyStateFilter'
import { FilterBar } from '../../../components/filters/FilterBar'
import { IconLabel } from '../../../components/IconLabel'
import { PageTitleWithProject } from '../../../components/PageTitleWithProject'
import { PanelContentStack } from '../../../components/PanelContentStack'
import { useQueryState } from '../../../components/states/useQueryState'
import { ScrollableTableContainer } from '../../../components/table/ScrollableTableContainer'
import { useCursorReset } from '../../../hooks/useCursorPagination'
import { useDeleteAction } from '../../../hooks/useDeleteAction'
import { useFilterState } from '../../../hooks/useFilterState'
import { useProjectSelector } from '../../../hooks/useProjectSelector'
import { useTableSort } from '../../../hooks/useTableSort'
import type { FilterFieldDefinition } from '../../../types/filters'
import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'
import { buildFilterParams } from '../../../utils/filterUtils'

import type { Credential, CredentialExtended, CredentialType } from './credentialConstants'
import { CredentialEmptyState } from './CredentialEmptyState'
import { createFilterChangeHandler, getCredentialNameFilterDefinition } from './credentialFilters'
import { FlatCredentialsTableBody, GroupedCredentialsTableBody } from './CredentialsTableBody'
import { DeleteCredentialDialog } from './DeleteCredentialDialog'
import { DisableCredentialDialog } from './DisableCredentialDialog'
import { CredentialFormModal } from './form/CredentialFormModal'
import { useDeleteCredentialState } from './useDeleteCredentialState'
import { useDisableCredentialState } from './useDisableCredentialState'

// eslint-disable-next-line max-lines-per-function
export default function Credentials() {
  const { showAlert } = useAlerts()
  const { selectedProject, isAllProjects, projects, ProjectSelector } = useProjectSelector()

  // UI state
  const [cursor, setCursor] = useState<string | null>(null)
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
  // Filter state
  const { filters, clearAllFilters, setAllFilters } = useFilterState()
  const filterFieldDefinitions = useMemo<FilterFieldDefinition[]>(() => [getCredentialNameFilterDefinition()], [])
  const handleFilterChange = createFilterChangeHandler(cursor, () => setCursor(null), clearAllFilters, setAllFilters)
  const handleClearAllFilters = () => {
    if (cursor) setCursor(null)
    clearAllFilters()
  }

  // Query params
  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = { limit: 20, include_total: true }
    if (selectedProject?.id) {
      params.project_id = selectedProject.id
    }
    Object.assign(params, buildFilterParams(filters))
    if (cursor) params.cursor = cursor
    return params
  }, [filters, cursor, selectedProject])

  // Fetch credentials
  const query = credentialsClient.useQuery('get', '/credentials', { params: { query: queryParams } })
  // Cast to extended type - backend returns workflow_count but contract doesn't declare it
  const credentials = (query.data?.resources ?? []) as CredentialExtended[]
  const hasActiveFilters = filters.length > 0

  useCursorReset(credentials.length, hasActiveFilters, cursor, query.isFetching, setCursor)

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
            showAlert({ title: 'Credential enabled', variant: 'success', autoDismiss: true })
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
          showAlert({ title: 'Credential disabled', variant: 'success', autoDismiss: true })
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

  const getRowActions = (credential: Credential): IAction[] => [
    {
      title: <IconLabel icon={<RhUiEditIcon />}>Edit</IconLabel>,
      onClick: () => setCredentialToEdit(credential),
    },
    { isSeparator: true },
    {
      title: <IconLabel icon={<RhUiTrashIcon />}>Delete</IconLabel>,
      onClick: () => openDeleteDialog(credential),
    },
  ]

  // Query state handling (loading/error)
  const queryState = useQueryState(query, {
    title: 'Error loading credentials',
    onRetry: () => detachPromise(query.refetch()),
  })
  if (queryState) {
    return (
      <AppPage>
        <AppPageHeader title={<PageTitleWithProject title="Credentials" projectSelector={ProjectSelector} />} />
        <AppPageMain>
          <AppPanel isFullHeight>{queryState}</AppPanel>
        </AppPageMain>
      </AppPage>
    )
  }

  return (
    <AppPage>
      <AppPageHeader title={<PageTitleWithProject title="Credentials" projectSelector={ProjectSelector} />}>
        <Button variant="secondary" onClick={() => setCreateModalOpen(true)} isDisabled={!selectedProject}>
          Create credential
        </Button>
      </AppPageHeader>

      {results.length === 0 && !hasActiveFilters ? (
        <AppPageMain>
          <CredentialEmptyState onCreateCredential={() => setCreateModalOpen(true)} />
        </AppPageMain>
      ) : (
        <AppPageMain>
          <AppPanel isFullHeight>
            <PanelContentStack>
              <StackItem>
                <FilterBar
                  fieldDefinitions={filterFieldDefinitions}
                  filters={filters}
                  onFilterChange={handleFilterChange}
                  showClearAll={true}
                />
              </StackItem>

              {results.length === 0 ? (
                <AppPageMain isCentered>
                  <EmptyStateFilter clearAllFilters={handleClearAllFilters} />
                </AppPageMain>
              ) : (
                <ScrollableTableContainer
                  aria-label="Credentials table"
                  footer={{
                    content: (
                      <>
                        {results.length} {results.length === 1 ? 'credential' : 'credentials'}
                        {query.data?.total != null && query.data.total > results.length && (
                          <Content
                            component={ContentVariants.small}
                            style={{
                              margin: 0,
                              display: 'inline',
                              color: 'var(--pf-t--global--text--color--subtle)',
                            }}
                          >
                            {' '}
                            (of {query.data.total} total)
                          </Content>
                        )}
                      </>
                    ),
                    prev: query.data?.prev ?? null,
                    next: query.data?.next ?? null,
                    onPrev: () => setCursor(query.data?.prev ?? null),
                    onNext: () => setCursor(query.data?.next ?? null),
                  }}
                >
                  <Thead>
                    <Tr>
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
                      getRowActions={getRowActions}
                      onToggleEnabled={handleToggleEnabled}
                    />
                  ) : (
                    <FlatCredentialsTableBody
                      credentials={results}
                      typeMap={typeMap}
                      getRowActions={getRowActions}
                      onToggleEnabled={handleToggleEnabled}
                    />
                  )}
                </ScrollableTableContainer>
              )}
            </PanelContentStack>
          </AppPanel>
        </AppPageMain>
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
    </AppPage>
  )
}
