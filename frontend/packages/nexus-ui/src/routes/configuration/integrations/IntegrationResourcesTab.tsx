import type { IntegrationsAPI } from '@ansible/nexus-contracts'
import {
  Button,
  Content,
  ContentVariants,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  SearchInput,
  StackItem,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core'
import { RhUiSyncIcon } from '@patternfly/react-icons'
import { Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useUnsavedChanges } from '../../../app/useUnsavedChanges'
import { integrationsClient, toolManagerClient } from '../../../client'
import { NxPageBody } from '../../../components/layout/NxPage'
import { NxEmptyStateNoData } from '../../../components/states/NxEmptyStateNoData'
import { NxScrollableTableContainer } from '../../../components/table/NxScrollableTableContainer'
import { useAlerts } from '../../../providers/alerts'
import { getErrorMessage } from '../../../utils/apiErrors'
import { formatTimeAgo } from '../../../utils/dateUtils'
import { detachPromise } from '../../../utils/detachPromise'

import styles from './IntegrationDetail.module.css'
import { useAllIntegrationTools } from './useAllIntegrationTools'
import { useToolSelection } from './useToolSelection'

type IntegrationRead = IntegrationsAPI.components['schemas']['IntegrationRead']

type IntegrationResourcesTabProps = Readonly<{
  integrationId: string
  lastRefreshedAt: string | null | undefined
  onRefreshed: () => Promise<IntegrationRead | undefined>
}>

export function IntegrationResourcesTab({ integrationId, lastRefreshedAt, onRefreshed }: IntegrationResourcesTabProps) {
  const { showAlert } = useAlerts()
  const queryClient = useQueryClient()
  const { registerDirtyCheck } = useUnsavedChanges()
  const [nameFilter, setNameFilter] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const { tools, refetch: refetchTools } = useAllIntegrationTools(integrationId)

  const filteredTools = useMemo(() => {
    if (!nameFilter) return tools
    const lower = nameFilter.toLowerCase()
    return tools.filter(
      (t) => (t.name ?? '').toLowerCase().includes(lower) || (t.description ?? '').toLowerCase().includes(lower)
    )
  }, [tools, nameFilter])

  const { enabledToolIds, enabledCount, allSelected, isDirty, handleSelectAll, handleSelectTool, resetToServer } =
    useToolSelection(tools, filteredTools)

  const { mutateAsync: updateTools } = toolManagerClient.useMutation('patch', '/tool_manager/tools/bulk_update')
  const { mutateAsync: refreshIntegrationAsync, isPending: isRefreshing } = integrationsClient.useMutation(
    'post',
    '/integrations/{integration_id}/refresh'
  )

  const handleSaveRef = useRef<() => Promise<boolean>>(null)

  handleSaveRef.current = async () => {
    const toEnable = tools.filter((t) => enabledToolIds.has(t.id)).map((t) => t.id)
    const toDisable = tools.filter((t) => !enabledToolIds.has(t.id)).map((t) => t.id)
    setIsSaving(true)
    try {
      if (toEnable.length > 0) await updateTools({ body: { tool_ids: toEnable, enabled: true } })
      if (toDisable.length > 0) await updateTools({ body: { tool_ids: toDisable, enabled: false } })
      await queryClient.invalidateQueries({ queryKey: ['all-integration-tools', integrationId] })
      await queryClient.invalidateQueries({ queryKey: ['get', '/integrations/{integration_id}'] })
      showAlert({
        title: 'Changes saved',
        description: 'Resource selections have been updated.',
        variant: 'success',
        autoDismiss: true,
      })
      return true
    } catch (error: unknown) {
      showAlert({
        title: 'Save failed',
        description: `Failed to save changes: ${getErrorMessage(error)}`,
        variant: 'danger',
        autoDismiss: true,
      })
      return false
    } finally {
      setIsSaving(false)
    }
  }

  function handleSave() {
    detachPromise(handleSaveRef.current?.() ?? Promise.resolve(false))
  }

  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty

  const resetToServerRef = useRef(resetToServer)
  resetToServerRef.current = resetToServer

  useEffect(() => {
    return registerDirtyCheck({
      check: () => isDirtyRef.current,
      saveAndExit: () => handleSaveRef.current?.() ?? Promise.resolve(false),
      exitWithoutSaving: () => resetToServerRef.current(),
      title: 'Save resource changes?',
      body: 'You have unsaved changes to enabled resources. Would you like to save before leaving?',
      saveLabel: 'Save changes',
    })
  }, [registerDirtyCheck])

  async function handleRefresh() {
    try {
      await refreshIntegrationAsync({ params: { path: { integration_id: integrationId } } })
      const updated = await onRefreshed()
      detachPromise(refetchTools())
      if (updated?.refresh_status === 'error') {
        showAlert({
          title: 'Refresh failed',
          description: updated.refresh_error ?? 'Failed to refresh resources.',
          variant: 'danger',
          autoDismiss: true,
        })
      } else {
        showAlert({
          title: 'Resources refreshed',
          description: 'Resources have been refreshed successfully.',
          variant: 'success',
          autoDismiss: true,
        })
      }
    } catch (error: unknown) {
      showAlert({
        title: 'Refresh failed',
        description: `Failed to refresh resources: ${getErrorMessage(error)}`,
        variant: 'danger',
        autoDismiss: true,
      })
    }
  }

  if (tools.length === 0) {
    return (
      <NxPageBody isCentered>
        <NxEmptyStateNoData
          title="No resources discovered yet"
          description="Click Refresh tools to discover available tools from this integration."
          buttonText="Refresh tools"
          addData={() => detachPromise(handleRefresh())}
        />
      </NxPageBody>
    )
  }

  return (
    <>
      <StackItem>
        <Toolbar>
          <ToolbarContent alignItems="center">
            <ToolbarItem>
              <SearchInput
                aria-label="Filter tools by name"
                placeholder="Filter tools by name"
                value={nameFilter}
                onChange={(_event, value) => setNameFilter(value)}
                onClear={() => setNameFilter('')}
              />
            </ToolbarItem>
            <ToolbarItem>
              <Content component={ContentVariants.small}>
                {enabledCount} of {tools.length} enabled
              </Content>
            </ToolbarItem>
            <ToolbarItem>
              <Button
                variant="plain"
                aria-label="Refresh resources"
                icon={<RhUiSyncIcon />}
                isLoading={isRefreshing}
                onClick={() => detachPromise(handleRefresh())}
              />
            </ToolbarItem>
            <ToolbarItem>
              <Content component={ContentVariants.small}>Last refreshed: {formatTimeAgo(lastRefreshedAt)}</Content>
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>
      </StackItem>

      <NxScrollableTableContainer aria-label="tools table" caption="Integration tools">
        <colgroup>
          <col className={styles.checkboxCol} />
          <col />
        </colgroup>
        <Thead>
          <Tr>
            <Th
              select={{
                onSelect: (_event, isSelecting) => handleSelectAll(isSelecting),
                isSelected: allSelected,
                isHeaderSelectDisabled: filteredTools.length === 0,
              }}
              screenReaderText="Select all tools"
            />
            <Th>Name</Th>
          </Tr>
        </Thead>
        <Tbody>
          {filteredTools.map((tool, index) => (
            <Tr key={tool.id}>
              <Td
                select={{
                  rowIndex: index,
                  onSelect: (_event, isSelecting) => handleSelectTool(tool.id, isSelecting),
                  isSelected: enabledToolIds.has(tool.id),
                }}
              />
              <Td dataLabel="Name">
                <DescriptionList>
                  <DescriptionListGroup>
                    <DescriptionListTerm>{tool.name}</DescriptionListTerm>
                    <DescriptionListDescription>{tool.description}</DescriptionListDescription>
                  </DescriptionListGroup>
                </DescriptionList>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </NxScrollableTableContainer>

      <div className={styles.resourcesFooter}>
        <Button
          variant="primary"
          onClick={isDirty ? handleSave : undefined}
          isAriaDisabled={!isDirty}
          isLoading={isSaving}
        >
          Save changes
        </Button>
      </div>
    </>
  )
}
