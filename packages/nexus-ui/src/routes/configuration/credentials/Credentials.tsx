import { Button, CompassPanel, Content, ContentVariants, Label, Stack, StackItem, Switch } from '@patternfly/react-core'
import { RhUiEditIcon, RhUiKeyIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { useMemo, useState } from 'react'

import { AppPage } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { AppRoute } from '../../../app/AppRoute'
import { credentialsClient } from '../../../client'
import { useAlerts } from '../../../components/alerts'
import { EmptyStateFilter } from '../../../components/EmptyStateFilter'
import { FilterBar } from '../../../components/filters/FilterBar'
import { IconLabel } from '../../../components/IconLabel'
import { useQueryState } from '../../../components/states/useQueryState'
import { LinkCell } from '../../../components/table/LinkCell'
import { ScrollableTableContainer } from '../../../components/table/ScrollableTableContainer'
import { UserTimestamp } from '../../../components/UserTimestamp'
import { useFilterState } from '../../../hooks/useFilterState'
import { useTableSort } from '../../../hooks/useTableSort'
import type { FilterFieldDefinition } from '../../../types/filters'
import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'
import { buildFilterParams } from '../../../utils/filterUtils'

import type { Credential, CredentialType } from './credentialConstants'
import { CredentialEmptyState } from './CredentialEmptyState'
import { createFilterChangeHandler, getCredentialNameFilterDefinition } from './credentialFilters'
import { DeleteCredentialDialog } from './DeleteCredentialDialog'
import { DisableCredentialDialog } from './DisableCredentialDialog'
import { CredentialFormModal } from './form/CredentialFormModal'
import { useDisableCredentialState } from './useDisableCredentialState'

// eslint-disable-next-line max-lines-per-function
export default function Credentials() {
  const { showAlert } = useAlerts()

  // UI state
  const [cursor, setCursor] = useState<string | null>(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [credentialToEdit, setCredentialToEdit] = useState<Credential | null>(null)
  const [credentialToDelete, setCredentialToDelete] = useState<Credential | null>(null)
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
    Object.assign(params, buildFilterParams(filters))
    if (cursor) params.cursor = cursor
    return params
  }, [filters, cursor])

  // Fetch credentials
  const query = credentialsClient.useQuery('get', '/credentials', { params: { query: queryParams } })
  const credentials = query.data?.resources ?? []
  const hasActiveFilters = filters.length > 0

  // Fetch credential types for type name lookup
  const typesQuery = credentialsClient.useQuery('get', '/credential-types')
  const typeMap = useMemo(() => {
    const map = new Map<string, CredentialType>()
    for (const t of typesQuery.data?.resources ?? []) {
      map.set(t.id, t)
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
  const { credentialToDisable, affectedWorkflows, workflowsFetchError, openDisableDialog, closeDisableDialog } =
    useDisableCredentialState()

  function handleToggleEnabled(credential: Credential) {
    if (credential.enabled) {
      openDisableDialog(credential)
    } else {
      patchCredential(
        { params: { path: { credential_id: credential.id } }, body: { enabled: true } },
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
      { params: { path: { credential_id: credentialToDisable.id } }, body: { enabled: false } },
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

  function handleConfirmDelete() {
    if (!credentialToDelete) return
    deleteCredential(
      { params: { path: { credential_id: credentialToDelete.id } } },
      {
        onSuccess: () => {
          showAlert({
            title: 'Credential deleted',
            description: `Credential "${credentialToDelete.name}" has been deleted.`,
            variant: 'success',
            autoDismiss: true,
          })
          detachPromise(query.refetch())
        },
        onError: (error: unknown) => {
          showAlert({
            title: 'Delete failed',
            description: getErrorMessage(error),
            variant: 'danger',
            autoDismiss: true,
          })
        },
        onSettled: () => setCredentialToDelete(null),
      }
    )
  }

  const getRowActions = (credential: Credential): IAction[] => [
    {
      title: <IconLabel icon={<RhUiEditIcon />}>Edit</IconLabel>,
      onClick: () => setCredentialToEdit(credential),
    },
    { isSeparator: true },
    {
      title: <IconLabel icon={<RhUiTrashIcon />}>Delete</IconLabel>,
      onClick: () => setCredentialToDelete(credential),
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
        <AppPageHeader title="Credentials" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>{queryState}</CompassPanel>
        </StackItem>
      </AppPage>
    )
  }

  return (
    <AppPage>
      <AppPageHeader title="Credentials">
        <Button variant="secondary" onClick={() => setCreateModalOpen(true)}>
          Create credential
        </Button>
      </AppPageHeader>

      {results.length === 0 && !hasActiveFilters ? (
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CredentialEmptyState onCreateCredential={() => setCreateModalOpen(true)} />
        </StackItem>
      ) : (
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>
            <Stack style={{ height: '100%' }}>
              <StackItem>
                <FilterBar
                  fieldDefinitions={filterFieldDefinitions}
                  filters={filters}
                  onFilterChange={handleFilterChange}
                  showClearAll={true}
                />
              </StackItem>

              {results.length === 0 ? (
                <StackItem isFilled style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <EmptyStateFilter clearAllFilters={handleClearAllFilters} />
                </StackItem>
              ) : (
                <StackItem isFilled style={{ minHeight: 0, overflow: 'auto' }}>
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
                    <Tbody>
                      {results.map((credential) => {
                        const credType = typeMap.get(credential.credential_type_id)
                        return (
                          <Tr key={credential.id}>
                            <Td dataLabel="Name">
                              <LinkCell
                                href={AppRoute.Configuration.Credentials.Detail.replace(':credentialId', credential.id)}
                              >
                                {credential.name}
                              </LinkCell>
                              {credential.description && (
                                <Content
                                  component={ContentVariants.small}
                                  style={{ margin: 0, color: 'var(--pf-t--global--text--color--subtle)' }}
                                >
                                  {credential.description}
                                </Content>
                              )}
                            </Td>
                            <Td dataLabel="Type">
                              {credType ? (
                                <Label variant="outline" isCompact icon={<RhUiKeyIcon />}>
                                  {credType.name}
                                </Label>
                              ) : (
                                '\u2014'
                              )}
                            </Td>
                            <Td dataLabel="Workflows">
                              {credential.workflow_count != null && credential.workflow_count > 0
                                ? credential.workflow_count
                                : '\u2014'}
                            </Td>
                            <Td dataLabel="Created">
                              <UserTimestamp user={credential.created_by} timestamp={credential.created_at} />
                            </Td>
                            <Td dataLabel="Last modified">
                              <UserTimestamp user={credential.updated_by} timestamp={credential.updated_at} />
                            </Td>

                            <Td dataLabel="State" onClick={(e) => e.stopPropagation()}>
                              <Switch
                                id={`credential-toggle-${credential.id}`}
                                label="Enabled"
                                isChecked={credential.enabled}
                                onChange={() => handleToggleEnabled(credential)}
                                isReversed
                              />
                            </Td>
                            <Td isActionCell onClick={(e) => e.stopPropagation()}>
                              <ActionsColumn items={getRowActions(credential)} />
                            </Td>
                          </Tr>
                        )
                      })}
                    </Tbody>
                  </ScrollableTableContainer>
                </StackItem>
              )}
            </Stack>
          </CompassPanel>
        </StackItem>
      )}

      <DisableCredentialDialog
        credential={credentialToDisable}
        affectedWorkflows={affectedWorkflows}
        workflowsFetchError={workflowsFetchError}
        isLoading={isPatchPending}
        onConfirm={handleConfirmDisable}
        onClose={closeDisableDialog}
      />

      <DeleteCredentialDialog
        credential={credentialToDelete}
        isLoading={isDeletePending}
        onConfirm={handleConfirmDelete}
        onClose={() => setCredentialToDelete(null)}
      />

      <CredentialFormModal
        isOpen={createModalOpen || !!credentialToEdit}
        onClose={() => {
          setCreateModalOpen(false)
          setCredentialToEdit(null)
        }}
        credentialToEdit={credentialToEdit}
        onSuccess={() => detachPromise(query.refetch())}
      />
    </AppPage>
  )
}
