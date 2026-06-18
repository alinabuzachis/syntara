import type { ExecutionStatus } from '@ansible/nexus-contracts'
import { Button, Flex, FlexItem, TextInput, Tooltip } from '@patternfly/react-core'
import { type Dispatch, type ReactNode } from 'react'

import { NxPageHeader } from '../../components/layout/NxPageHeader'
import { WorkflowPublishStatusBadge } from '../../components/WorkflowPublishStatusBadge'
import { useDialogState } from '../../hooks/useDialogState'
import { useDocLink } from '../../utils/docs/useDocLink'
import { CancelExecutionButton } from '../executions/CancelExecutionButton'
import { isExecutionCancellable } from '../executions/executionCancellable'

import { BuilderEditorToolbar } from './BuilderEditorToolbar'
import type { BuilderAction } from './builderReducer'
import { EditWorkflowDetailsPopover } from './EditWorkflowDetailsPopover'
import { PublishWorkflowDialog } from './PublishWorkflowDialog'
import type { BuilderPermissions } from './useBuilderPermissions'

type BuilderToolbarContentProps = Readonly<{
  isLiveRunActive?: boolean
  executionId?: string | null
  executionStatus?: ExecutionStatus | null
  hasApprovalPending?: boolean
  isApprovalLoading?: boolean
  isApprovalPanelOpen?: boolean
  onBackToEditor?: () => void
  onReviewApproval?: () => void
  dispatch: Dispatch<BuilderAction>
  markDirty: () => void
  handleToggleHistory: () => void
  isNew: boolean
  workflow: { id: string } | undefined
  isPending: boolean
  isDirty: boolean
  lastSavedAt?: string | null
  isKebabOpen: boolean
  publishedVersion: number | null
  handleToggleDetails: () => void
  handleSaveWorkflow: () => Promise<boolean>
  onPublishClick: () => void
  onUnpublish: () => void
  triggers?: { id: string; name?: string }[]
  isAddNodePanelOpen: boolean
  hasNoWorkflowNodes: boolean
  builderPermissions: BuilderPermissions
}>

/**
 * Renders appropriate toolbar based on builder state:
 * - Live run active: optional approval review + back button
 * - Default: full editor toolbar
 */
function BuilderToolbarContent({
  isLiveRunActive,
  executionId,
  executionStatus,
  hasApprovalPending,
  isApprovalLoading,
  isApprovalPanelOpen,
  onBackToEditor,
  onReviewApproval,
  dispatch,
  markDirty,
  handleToggleHistory,
  isNew,
  workflow,
  isPending,
  isDirty,
  lastSavedAt,
  isKebabOpen,
  publishedVersion,
  handleToggleDetails,
  handleSaveWorkflow,
  onPublishClick,
  onUnpublish,
  triggers,
  isAddNodePanelOpen,
  hasNoWorkflowNodes,
  builderPermissions,
}: BuilderToolbarContentProps) {
  if (isLiveRunActive && onBackToEditor) {
    const isCancellable = isExecutionCancellable(executionStatus)
    return (
      <>
        {hasApprovalPending && onReviewApproval && (
          <Button
            variant="primary"
            isLoading={isApprovalLoading}
            isAriaDisabled={isApprovalPanelOpen}
            onClick={isApprovalPanelOpen ? undefined : onReviewApproval}
          >
            Review approval
          </Button>
        )}
        {isCancellable && executionId && <CancelExecutionButton executionId={executionId} />}
        <Button variant="primary" onClick={onBackToEditor}>
          Back to editor
        </Button>
      </>
    )
  }

  return (
    <BuilderEditorToolbar
      isNew={isNew}
      workflow={workflow}
      isPending={isPending}
      isDirty={isDirty}
      lastSavedAt={lastSavedAt}
      isKebabOpen={isKebabOpen}
      publishedVersion={publishedVersion}
      dispatch={dispatch}
      markDirty={markDirty}
      handleToggleHistory={handleToggleHistory}
      handleToggleDetails={handleToggleDetails}
      handleSaveWorkflow={handleSaveWorkflow}
      onPublishClick={onPublishClick}
      onUnpublish={onUnpublish}
      triggers={triggers}
      isAddNodePanelOpen={isAddNodePanelOpen}
      hasNoWorkflowNodes={hasNoWorkflowNodes}
      builderPermissions={builderPermissions}
    />
  )
}

/**
 * Header props are intentionally flat for this extraction; many fields mirror `BuilderContent` state.
 * Follow-up: consider grouping (e.g. `toolbarHandlers`) or builder-scoped context to trim prop drilling
 * without re-inflating `BuilderContent` cognitive complexity — see PR review discussion.
 */
export type BuilderWorkflowPageHeaderProps = Readonly<{
  workflowName: string
  workflowDescription: string
  workflowTags: string[]
  isNew: boolean
  workflow: { id: string } | undefined
  isPending: boolean
  isDirty: boolean
  lastSavedAt?: string | null
  isKebabOpen: boolean
  publishedVersion: number | null
  currentVersion: number | undefined
  isPublishing: boolean
  isLiveRunActive?: boolean
  executionId?: string | null
  executionStatus?: ExecutionStatus | null
  onBackToEditor?: () => void
  hasApprovalPending?: boolean
  isApprovalLoading?: boolean
  isApprovalPanelOpen?: boolean
  onReviewApproval?: () => void
  triggers?: { id: string; name?: string }[]
  isAddNodePanelOpen: boolean
  hasNoWorkflowNodes: boolean
  builderPermissions: BuilderPermissions
  ProjectSelector: ReactNode
  dispatch: Dispatch<BuilderAction>
  markDirty: () => void
  handleToggleHistory: () => void
  handleToggleDetails: () => void
  handleSaveWorkflow: () => Promise<boolean>
  onPublish: (publishName?: string, description?: string, onSettled?: () => void) => void
  onUnpublish: () => void
}>

/**
 * Builder page title row (name, project, details) and primary toolbar actions.
 */
export function BuilderWorkflowPageHeader({
  workflowName,
  workflowDescription,
  workflowTags,
  isNew,
  workflow,
  isPending,
  isDirty,
  lastSavedAt,
  isKebabOpen,
  publishedVersion,
  currentVersion,
  isPublishing,
  isLiveRunActive,
  executionId,
  executionStatus,
  onBackToEditor,
  hasApprovalPending,
  isApprovalLoading,
  isApprovalPanelOpen,
  onReviewApproval,
  triggers,
  isAddNodePanelOpen,
  hasNoWorkflowNodes,
  builderPermissions,
  ProjectSelector,
  dispatch,
  markDirty,
  handleToggleHistory,
  handleToggleDetails,
  handleSaveWorkflow,
  onPublish,
  onUnpublish,
}: BuilderWorkflowPageHeaderProps) {
  const builderDocLink = useDocLink('builder')
  const publishDialog = useDialogState<true>()

  return (
    <>
      <NxPageHeader
        title={workflowName}
        docLink={builderDocLink}
        titleSlot={
          <Flex
            gap={{ default: 'gapMd' }}
            alignItems={{ default: 'alignItemsCenter' }}
            flexWrap={{ default: 'nowrap' }}
          >
            <FlexItem style={{ flexShrink: 1, minWidth: 0 }}>
              <Tooltip
                content={builderPermissions.tooltips.edit}
                trigger={builderPermissions.canEdit ? 'manual' : 'mouseenter focus'}
              >
                <TextInput
                  id="workflow-name-input"
                  type="text"
                  aria-label="Workflow name"
                  value={workflowName}
                  isDisabled={!builderPermissions.canEdit}
                  onChange={(_event, value) => {
                    dispatch({ type: 'SET_WORKFLOW_NAME', payload: value })
                    markDirty()
                  }}
                  placeholder="Workflow name"
                />
              </Tooltip>
            </FlexItem>
            {builderPermissions.canEdit && (
              <FlexItem style={{ flexShrink: 0 }}>
                <EditWorkflowDetailsPopover
                  name={workflowName}
                  description={workflowDescription}
                  tags={workflowTags}
                  onApply={(name, description, tags) => {
                    const nameChanged = name !== workflowName
                    const descriptionChanged = description !== workflowDescription
                    const tagsChanged =
                      tags.length !== workflowTags.length || tags.some((t, i) => t !== workflowTags[i])
                    if (nameChanged) dispatch({ type: 'SET_WORKFLOW_NAME', payload: name })
                    if (descriptionChanged) dispatch({ type: 'SET_WORKFLOW_DESCRIPTION', payload: description })
                    if (tagsChanged) dispatch({ type: 'SET_WORKFLOW_TAGS', payload: tags })
                    if (nameChanged || descriptionChanged || tagsChanged) markDirty()
                  }}
                />
              </FlexItem>
            )}
            {!isNew && (
              <FlexItem style={{ flexShrink: 0 }}>
                <WorkflowPublishStatusBadge publishedVersion={publishedVersion} currentVersion={currentVersion} />
              </FlexItem>
            )}
            {builderPermissions.canEdit && <FlexItem style={{ flexShrink: 0 }}>{ProjectSelector}</FlexItem>}
          </Flex>
        }
        toolbar={
          <BuilderToolbarContent
            isLiveRunActive={isLiveRunActive}
            executionId={executionId}
            executionStatus={executionStatus}
            hasApprovalPending={hasApprovalPending}
            isApprovalLoading={isApprovalLoading}
            isApprovalPanelOpen={isApprovalPanelOpen}
            onBackToEditor={onBackToEditor}
            onReviewApproval={onReviewApproval}
            dispatch={dispatch}
            markDirty={markDirty}
            handleToggleHistory={handleToggleHistory}
            isNew={isNew}
            workflow={workflow}
            isPending={isPending}
            isDirty={isDirty}
            lastSavedAt={lastSavedAt}
            isKebabOpen={isKebabOpen}
            publishedVersion={publishedVersion}
            handleToggleDetails={handleToggleDetails}
            handleSaveWorkflow={handleSaveWorkflow}
            onPublishClick={() => publishDialog.open(true)}
            onUnpublish={onUnpublish}
            triggers={triggers}
            isAddNodePanelOpen={isAddNodePanelOpen}
            hasNoWorkflowNodes={hasNoWorkflowNodes}
            builderPermissions={builderPermissions}
          />
        }
      />

      <PublishWorkflowDialog
        isOpen={publishDialog.isOpen}
        isPublishing={isPublishing}
        onClose={publishDialog.close}
        onPublish={(publishName, description) => {
          onPublish(publishName, description, publishDialog.close)
        }}
      />
    </>
  )
}
