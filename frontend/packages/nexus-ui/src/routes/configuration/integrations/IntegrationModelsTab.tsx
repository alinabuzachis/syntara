import { Button, Content, ContentVariants, StackItem, ToolbarItem } from '@patternfly/react-core'
import { RhUiSyncIcon } from '@patternfly/react-icons'
import { Tbody, Th, Thead, Tr } from '@patternfly/react-table'
import type { IntegrationsAPI } from '@syntara/contracts'
import { useCallback, useMemo, useState } from 'react'

import { integrationsClient } from '../../../client'
import { FilterBar } from '../../../components/filters/FilterBar'
import { NxPageBody } from '../../../components/layout/NxPage'
import { NxEmptyStateFilter } from '../../../components/states/NxEmptyStateFilter'
import { NxEmptyStateNoData } from '../../../components/states/NxEmptyStateNoData'
import { NxErrorState } from '../../../components/states/NxErrorState'
import { NxLoadingState } from '../../../components/states/NxLoadingState'
import { NxScrollableTableContainer } from '../../../components/table/NxScrollableTableContainer'
import { useAlerts } from '../../../providers/alerts'
import type { FilterConfig, FilterFieldDefinition } from '../../../types/filters'
import { getErrorMessage } from '../../../utils/apiErrors'
import { formatTimeAgo } from '../../../utils/dateUtils'
import { detachPromise } from '../../../utils/detachPromise'

import styles from './IntegrationDetail.module.css'
import { getIntegrationNameFilterDefinition } from './integrationFilters'
import { ModelRow } from './ModelRow'

type IntegrationRead = IntegrationsAPI.components['schemas']['IntegrationRead']
type LLMModelRead = IntegrationsAPI.components['schemas']['LLMModelRead']

type IntegrationModelsTabProps = Readonly<{
  /** The integration whose models are being managed. */
  integrationId: string
  /** All models for the integration. */
  models: LLMModelRead[]
  /** Whether the model list is loading. */
  isLoading: boolean
  /** Error message if model loading failed. */
  error: string | null
  /** Re-fetches the model list. */
  refetchModels: () => Promise<unknown>
  /** IDs of currently enabled models. */
  enabledModelIds: Set<string>
  /** Number of currently enabled models. */
  enabledCount: number
  /** Whether all filtered models are selected. */
  allSelected: boolean
  /** Toggles all filtered models. */
  handleSelectAll: (checked: boolean) => void
  /** ID of the current default model. */
  defaultModelId: string | null
  /** Toggles a model with default-clearing behavior. */
  handleSelectWithDefaultClear: (modelId: string, checked: boolean) => void
  /** Sets a model as the default. */
  handleSetDefault: (modelId: string) => void
  /** Removes default status from a model. */
  handleRemoveDefault: (modelId: string) => void
  /** Resets selection to server state. */
  resetSelectionToServer: () => void
  /** Resets default to server state. */
  resetDefault: () => void
  /** ISO timestamp of the last model refresh, displayed in the toolbar. */
  lastRefreshedAt: string | null | undefined
  /** Whether the user has permission to toggle, refresh, or save models. */
  canUpdate: boolean
  /** Tooltip explaining why actions are disabled when canUpdate is false. */
  updateTooltip?: string
  /** Called after a refresh completes to re-fetch the parent integration data. */
  onRefreshed: () => Promise<IntegrationRead | undefined>
}>

/** Triggers a model refresh via the backend, refetches the model list, and shows a success or error toast. */
async function performRefresh({
  integrationId,
  refreshAsync,
  onRefreshed,
  refetchModels,
  showAlert,
}: {
  integrationId: string
  refreshAsync: (args: { params: { path: { integration_id: string } } }) => Promise<unknown>
  onRefreshed: () => Promise<IntegrationRead | undefined>
  refetchModels: () => unknown
  showAlert: ReturnType<typeof useAlerts>['showAlert']
}) {
  try {
    await refreshAsync({ params: { path: { integration_id: integrationId } } })
    const updated = await onRefreshed()
    detachPromise(refetchModels())
    const title = updated?.refresh_status === 'error' ? 'Refresh failed' : 'Models refreshed'
    const description =
      updated?.refresh_status === 'error'
        ? (updated.refresh_error ?? 'Failed to refresh models.')
        : 'Models have been refreshed successfully.'
    showAlert({
      title,
      description,
      variant: updated?.refresh_status === 'error' ? 'danger' : 'success',
      autoDismiss: true,
    })
  } catch (error: unknown) {
    showAlert({
      title: 'Refresh failed',
      description: `Failed to refresh models: ${getErrorMessage(error)}`,
      variant: 'danger',
      autoDismiss: true,
    })
  }
}

const modelFilterFieldDefinitions: FilterFieldDefinition[] = [getIntegrationNameFilterDefinition()]

function extractNameFilter(filters: FilterConfig[]): string {
  const f = filters.find((cf) => cf.key === 'name')
  return typeof f?.value === 'string' ? f.value : ''
}

/** Toolbar with keyword filter, enabled count, refresh button, and last-refreshed timestamp. */
function ModelsToolbar({
  filters,
  onFilterChange,
  onClearAllFilters,
  enabledCount,
  totalCount,
  isRefreshing,
  canUpdate,
  onRefresh,
  lastRefreshedAt,
}: Readonly<{
  filters: FilterConfig[]
  onFilterChange: (filters: FilterConfig[]) => void
  onClearAllFilters: () => void
  enabledCount: number
  totalCount: number
  isRefreshing: boolean
  canUpdate: boolean
  onRefresh: () => void
  lastRefreshedAt: string | null | undefined
}>) {
  return (
    <FilterBar
      fieldDefinitions={modelFilterFieldDefinitions}
      filters={filters}
      onFilterChange={onFilterChange}
      clearAllFilters={onClearAllFilters}
      toolbarItemsAfterFilters={
        <>
          <ToolbarItem>
            <Content component={ContentVariants.small}>
              {enabledCount} of {totalCount} enabled
            </Content>
          </ToolbarItem>
          <ToolbarItem>
            <Button
              variant="plain"
              aria-label="Refresh models"
              icon={<RhUiSyncIcon />}
              isLoading={isRefreshing}
              isAriaDisabled={!canUpdate || isRefreshing}
              onClick={canUpdate ? onRefresh : undefined}
            />
          </ToolbarItem>
          <ToolbarItem>
            <Content component={ContentVariants.small}>Last refreshed: {formatTimeAgo(lastRefreshedAt)}</Content>
          </ToolbarItem>
        </>
      }
    />
  )
}

export function IntegrationModelsTab({
  integrationId,
  models,
  isLoading,
  error,
  refetchModels,
  enabledModelIds,
  enabledCount,
  allSelected,
  handleSelectAll,
  defaultModelId,
  handleSelectWithDefaultClear,
  handleSetDefault,
  handleRemoveDefault,
  resetSelectionToServer,
  resetDefault,
  lastRefreshedAt,
  canUpdate,
  updateTooltip,
  onRefreshed,
}: IntegrationModelsTabProps) {
  const { showAlert } = useAlerts()
  const [filters, setFilters] = useState<FilterConfig[]>([])

  const nameFilter = useMemo(() => extractNameFilter(filters), [filters])
  const hasActiveFilters = filters.length > 0
  const handleClearAllFilters = useCallback(() => setFilters([]), [])

  const sortedModels = useMemo(() => [...models].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')), [models])

  const filteredModels = useMemo(() => {
    if (!nameFilter) return sortedModels
    const lower = nameFilter.toLowerCase()
    return sortedModels.filter(
      (m) => (m.name ?? '').toLowerCase().includes(lower) || (m.description ?? '').toLowerCase().includes(lower)
    )
  }, [sortedModels, nameFilter])

  const { mutateAsync: refreshAsync, isPending: isRefreshing } = integrationsClient.useMutation(
    'post',
    '/integrations/{integration_id}/refresh'
  )

  const handleRefresh = () => {
    resetSelectionToServer()
    resetDefault()
    detachPromise(performRefresh({ integrationId, refreshAsync, onRefreshed, refetchModels, showAlert }))
  }

  if (isLoading)
    return (
      <NxPageBody isCentered>
        <NxLoadingState />
      </NxPageBody>
    )

  if (error)
    return (
      <NxPageBody isCentered>
        <NxErrorState title="Unable to load models" message={error} onRetry={() => detachPromise(refetchModels())} />
      </NxPageBody>
    )

  if (models.length === 0)
    return (
      <NxPageBody isCentered>
        <NxEmptyStateNoData
          title="No models discovered yet"
          description="Click Refresh models to discover available models from this provider."
          buttonText="Refresh models"
          addData={canUpdate ? handleRefresh : undefined}
        />
      </NxPageBody>
    )

  return (
    <>
      <StackItem>
        <ModelsToolbar
          filters={filters}
          onFilterChange={setFilters}
          onClearAllFilters={handleClearAllFilters}
          enabledCount={enabledCount}
          totalCount={models.length}
          isRefreshing={isRefreshing}
          canUpdate={canUpdate}
          onRefresh={handleRefresh}
          lastRefreshedAt={lastRefreshedAt}
        />
      </StackItem>
      {hasActiveFilters && filteredModels.length === 0 ? (
        <NxEmptyStateFilter clearAllFilters={handleClearAllFilters} />
      ) : (
        <NxScrollableTableContainer caption="Integration models">
          <colgroup>
            <col className={styles.checkboxCol} />
            <col />
            <col />
          </colgroup>
          <Thead>
            <Tr>
              <Th
                select={{
                  onSelect: (_event, isSelecting) => handleSelectAll(isSelecting),
                  isSelected: allSelected,
                  isHeaderSelectDisabled: !canUpdate || filteredModels.length === 0,
                  isDisabled: !canUpdate || filteredModels.length === 0,
                }}
                screenReaderText="Select all models"
              />
              <Th>Name</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {filteredModels.map((model, index) => (
              <ModelRow
                key={model.id}
                model={model}
                index={index}
                isEnabled={enabledModelIds.has(model.id)}
                isDefault={model.id === defaultModelId}
                isDisabled={!canUpdate}
                disabledTooltip={updateTooltip}
                onSelect={handleSelectWithDefaultClear}
                onSetDefault={handleSetDefault}
                onRemoveDefault={handleRemoveDefault}
              />
            ))}
          </Tbody>
        </NxScrollableTableContainer>
      )}
    </>
  )
}
