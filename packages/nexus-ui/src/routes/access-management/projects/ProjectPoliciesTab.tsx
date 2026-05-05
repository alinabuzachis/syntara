import { Label, StackItem } from '@patternfly/react-core'
import { RhUiEditFillIcon, RhUiLockIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction, ThProps } from '@patternfly/react-table'
import { useState } from 'react'

import { AppPageMain } from '../../../app/AppPage'
import { useAlerts } from '../../../components/alerts'
import { ConfirmationDialog } from '../../../components/ConfirmationDialog'
import { EmptyStateFilter } from '../../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../../components/EmptyStateNoData'
import { FilterBar } from '../../../components/filters'
import { IconLabel } from '../../../components/IconLabel'
import { PanelContentStack } from '../../../components/PanelContentStack'
import { useQueryState } from '../../../components/states/useQueryState'
import { ScrollableTableContainer } from '../../../components/table/ScrollableTableContainer'
import { useDialogState } from '../../../hooks/useDialogState'
import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'
import { accessClient } from '../../access/accessClient'
import { builtinFilterDefinitions } from '../../access/builtinFilterDefinitions'
import type { ProjectPolicyRead } from '../../access/types'
import { useBuiltinListState } from '../../access/useBuiltinListState'

import { EditProjectPolicyDialog } from './EditProjectPolicyDialog'

const sortFieldByColumn: Record<number, string> = {
  0: 'name',
  2: 'is_builtin',
}

function isProjectOwned(policy: ProjectPolicyRead): boolean {
  return policy.project_id != null && !policy.is_builtin
}

function ProjectPoliciesTable({
  policies,
  getSortParams,
  onEdit,
  onDelete,
}: Readonly<{
  policies: ProjectPolicyRead[]
  getSortParams: (columnIndex: number) => ThProps['sort']
  onEdit: (policy: ProjectPolicyRead) => void
  onDelete: (policy: ProjectPolicyRead) => void
}>) {
  const getPolicyActions = (policy: ProjectPolicyRead): IAction[] => [
    {
      title: <IconLabel icon={<RhUiEditFillIcon />}>Edit policy</IconLabel>,
      onClick: () => onEdit(policy),
    },
    { isSeparator: true },
    {
      title: <IconLabel icon={<RhUiTrashIcon />}>Delete policy</IconLabel>,
      onClick: () => onDelete(policy),
    },
  ]

  return (
    <>
      <Thead>
        <Tr>
          <Th sort={getSortParams(0)}>Name</Th>
          <Th>Description</Th>
          <Th sort={getSortParams(2)} modifier="nowrap">
            Type
          </Th>
          <Th screenReaderText="Actions" />
        </Tr>
      </Thead>
      <Tbody>
        {policies.map((policy) => (
          <Tr key={policy.id}>
            <Td dataLabel="Name">
              <code>{policy.name}</code>
            </Td>
            <Td dataLabel="Description">{policy.description ?? '-'}</Td>
            <Td dataLabel="Type">
              {policy.is_builtin ? (
                <Label color="grey" icon={<RhUiLockIcon />} isCompact>
                  Built-in
                </Label>
              ) : (
                <Label color="blue" isCompact>
                  Custom
                </Label>
              )}
            </Td>
            <Td isActionCell>{isProjectOwned(policy) && <ActionsColumn items={getPolicyActions(policy)} />}</Td>
          </Tr>
        ))}
      </Tbody>
    </>
  )
}

export function ProjectPoliciesTab({ projectId }: Readonly<{ projectId: string }>) {
  const {
    filters,
    hasActiveFilters,
    handleFilterChange,
    clearAllFilters,
    getSortParams,
    queryParams,
    page,
    perPage,
    handlePerPageChange,
    goToPrevPage,
    goToNextPage,
  } = useBuiltinListState(sortFieldByColumn)
  const [policyToEdit, setPolicyToEdit] = useState<ProjectPolicyRead | null>(null)
  const deleteDialog = useDialogState<ProjectPolicyRead>()
  const { showSuccess, showError } = useAlerts()

  const policiesQuery = accessClient.useQuery('get', '/projects/{project_id}/policies', {
    params: {
      path: { project_id: projectId },
      query: queryParams,
    },
  })

  const policies = policiesQuery.data?.resources ?? []

  const { mutate: deletePolicy } = accessClient.useMutation('delete', '/projects/{project_id}/policies/{policy_id}')

  const handlePoliciesChanged = () => {
    detachPromise(policiesQuery.refetch())
  }

  const handleDelete = (policy: ProjectPolicyRead | null) => {
    if (!policy) return
    deletePolicy(
      { params: { path: { project_id: projectId, policy_id: policy.id } } },
      {
        onSuccess: () => {
          showSuccess({ title: 'Policy deleted', description: `Deleted policy "${policy.name}"` })
          handlePoliciesChanged()
        },
        onError: (error) => {
          showError({ title: 'Failed to delete policy', description: getErrorMessage(error) })
        },
        onSettled: () => deleteDialog.close(),
      }
    )
  }

  const queryState = useQueryState(policiesQuery, {
    title: 'Error loading policies',
    onRetry: () => detachPromise(policiesQuery.refetch()),
  })

  if (queryState) {
    return queryState
  }

  if (policies.length === 0 && !hasActiveFilters) {
    return <EmptyStateNoData title="No policies found" description="No policies are available for this project." />
  }

  return (
    <>
      <PanelContentStack>
        <StackItem>
          <FilterBar
            fieldDefinitions={builtinFilterDefinitions}
            filters={filters}
            onFilterChange={handleFilterChange}
            showClearAll={true}
            clearAllFilters={clearAllFilters}
          />
        </StackItem>

        {policies.length === 0 ? (
          <AppPageMain isCentered>
            <EmptyStateFilter clearAllFilters={clearAllFilters} />
          </AppPageMain>
        ) : (
          <ScrollableTableContainer
            aria-label="Project policies"
            footer={{
              page,
              perPage,
              total: policiesQuery.data?.total ?? null,
              hasNext: !!policiesQuery.data?.next,
              onPrev: goToPrevPage,
              onNext: () => goToNextPage(policiesQuery.data?.next ?? null),
              onPerPageChange: handlePerPageChange,
            }}
          >
            <ProjectPoliciesTable
              policies={policies}
              getSortParams={getSortParams}
              onEdit={setPolicyToEdit}
              onDelete={deleteDialog.open}
            />
          </ScrollableTableContainer>
        )}
      </PanelContentStack>

      {policyToEdit && (
        <EditProjectPolicyDialog
          projectId={projectId}
          policy={policyToEdit}
          onClose={() => setPolicyToEdit(null)}
          onSuccess={handlePoliciesChanged}
        />
      )}

      <ConfirmationDialog
        isOpen={deleteDialog.isOpen}
        onClose={deleteDialog.close}
        onConfirm={() => handleDelete(deleteDialog.item)}
        title="Delete policy?"
        confirmLabel="Delete"
        confirmVariant="danger"
        titleIconVariant="warning"
      >
        Permanently delete policy <strong>{deleteDialog.item?.name}</strong>? Any roles using this policy will lose its
        permissions.
      </ConfirmationDialog>
    </>
  )
}
