import type { ExecutionStatus } from '@ansible/nexus-contracts'
import { Button, Content, ContentVariants, Flex, FlexItem, Icon, TextInput, Tooltip } from '@patternfly/react-core'
import { RhUiClockIcon, RhUiUndoIcon } from '@patternfly/react-icons'
import { type Dispatch, type ReactNode } from 'react'

import { DisabledWithTooltip } from '../../components/DisabledWithTooltip'
import { NxLabel } from '../../components/labels/NxLabel'
import { NxPageHeader } from '../../components/layout/NxPageHeader'
import { WorkflowPublishStatusBadge } from '../../components/WorkflowPublishStatusBadge'
import { useDialogState } from '../../hooks/useDialogState'
import { useDocLink } from '../../utils/docs/useDocLink'
import { CancelExecutionButton } from '../executions/CancelExecutionButton'
import { isExecutionCancellable } from '../executions/executionCancellable'

import { BuilderEditorToolbar } from './BuilderEditorToolbar'
import type { BuilderAction } from './builderReducer'
import headerStyles from './BuilderWorkflowPageHeader.module.css'
import { EditWorkflowDetailsPopover } from './EditWorkflowDetailsPopover'
import { formatHistoryDateTime } from './historyDateUtils'
import { isVersionStatus } from './hooks/useVersionHistory'
import { PublishWorkflowDialog } from './PublishWorkflowDialog'
import type { BuilderPermissions } from './useBuilderPermissions'
import type { PendingImportData } from './useWorkflowImportExport'
import { VersionStatusBadge } from './VersionStatusBadge'

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
  handleToggleVersionHistory: () => void
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
  onPendingImport: (data: PendingImportData) => void
  triggers?: { id: string; name?: string }[]
  isBuiltin: boolean
  isAddNodePanelOpen: boolean
  hasNoWorkflowNodes: boolean
  builderPermissions: BuilderPermissions
  isViewingVersion?: boolean
  versionHistoryOpen?: boolean
  onExitVersionView?: () => void
  onRestoreVersion?: () => void
  onToggleVersionHistory?: () => void
}>

/**
 * Renders appropriate toolbar based on builder state:
 * - Version view active: restore + back to editor + version history toggle
 * - Live run active: optional approval review + back button
 * - Default: full editor toolbar
 */
function BuilderToolbarContent({
  isBuiltin,
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
  handleToggleVersionHistory,
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
  onPendingImport,
  triggers,
  isAddNodePanelOpen,
  hasNoWorkflowNodes,
  builderPermissions,
  isViewingVersion,
  versionHistoryOpen,
  onExitVersionView,
  onRestoreVersion,
  onToggleVersionHistory,
}: BuilderToolbarContentProps) {
  if (isViewingVersion && onExitVersionView) {
    return (
      <>
        {onRestoreVersion && (
          <DisabledWithTooltip isDisabled={!builderPermissions.canEdit} content={builderPermissions.tooltips.edit}>
            <Button
              variant="secondary"
              onClick={onRestoreVersion}
              isAriaDisabled={!builderPermissions.canEdit}
              icon={
                <Icon isInline>
                  <RhUiUndoIcon />
                </Icon>
              }
            >
              Restore version
            </Button>
          </DisabledWithTooltip>
        )}
        <Button variant="primary" onClick={onExitVersionView}>
          Back to editor
        </Button>
        {onToggleVersionHistory && (
          <Button
            variant="plain"
            onClick={onToggleVersionHistory}
            isClicked={versionHistoryOpen}
            aria-pressed={versionHistoryOpen}
            aria-label="Version history"
          >
            <Icon isInline>
              <RhUiClockIcon />
            </Icon>
          </Button>
        )}
      </>
    )
  }

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
      isBuiltin={isBuiltin}
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
      handleToggleVersionHistory={handleToggleVersionHistory}
      handleToggleDetails={handleToggleDetails}
      handleSaveWorkflow={handleSaveWorkflow}
      onPublishClick={onPublishClick}
      onUnpublish={onUnpublish}
      onPendingImport={onPendingImport}
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
  isBuiltin: boolean
  builderPermissions: BuilderPermissions
  ProjectSelector: ReactNode
  dispatch: Dispatch<BuilderAction>
  markDirty: () => void
  handleToggleHistory: () => void
  handleToggleVersionHistory: () => void
  handleToggleDetails: () => void
  handleSaveWorkflow: () => Promise<boolean>
  onPublish: (publishName?: string, description?: string, onSettled?: () => void) => void
  onUnpublish: () => void
  isViewingVersion?: boolean
  versionHistoryOpen?: boolean
  viewedVersionDate?: string | null
  viewedVersionStatus?: string | null
  onExitVersionView?: () => void
  onRestoreVersion?: () => void
  onPendingImport: (data: PendingImportData) => void
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
  isBuiltin,
  builderPermissions,
  ProjectSelector,
  dispatch,
  markDirty,
  handleToggleHistory,
  handleToggleVersionHistory,
  handleToggleDetails,
  handleSaveWorkflow,
  onPublish,
  onUnpublish,
  isViewingVersion,
  versionHistoryOpen,
  viewedVersionDate,
  viewedVersionStatus,
  onExitVersionView,
  onRestoreVersion,
  onPendingImport,
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
            style={{ height: '100%' }}
          >
            <FlexItem style={{ flexShrink: 1, minWidth: 0 }}>
              {isViewingVersion ? (
                <Content component={ContentVariants.p} className={headerStyles.versionViewTitle}>
                  {workflowName}
                </Content>
              ) : (
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
              )}
            </FlexItem>
            {builderPermissions.canEdit && !isViewingVersion && (
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
            {!isNew && !isViewingVersion && (
              <FlexItem style={{ flexShrink: 0 }}>
                <WorkflowPublishStatusBadge publishedVersion={publishedVersion} currentVersion={currentVersion} />
              </FlexItem>
            )}
            {(builderPermissions.canEdit || isBuiltin) && !isViewingVersion && (
              <FlexItem style={{ flexShrink: 0 }}>{ProjectSelector}</FlexItem>
            )}
            {isViewingVersion && viewedVersionDate && (
              <FlexItem className={headerStyles.fixedWidthItem}>
                <NxLabel color="grey">Viewing {formatHistoryDateTime(viewedVersionDate)}</NxLabel>
              </FlexItem>
            )}
            {isViewingVersion && viewedVersionStatus && isVersionStatus(viewedVersionStatus) && (
              <FlexItem className={headerStyles.fixedWidthItem}>
                <VersionStatusBadge status={viewedVersionStatus} />
              </FlexItem>
            )}
          </Flex>
        }
        toolbar={
          <BuilderToolbarContent
            isBuiltin={isBuiltin}
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
            handleToggleVersionHistory={handleToggleVersionHistory}
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
            onPendingImport={onPendingImport}
            triggers={triggers}
            isAddNodePanelOpen={isAddNodePanelOpen}
            hasNoWorkflowNodes={hasNoWorkflowNodes}
            builderPermissions={builderPermissions}
            isViewingVersion={isViewingVersion}
            versionHistoryOpen={versionHistoryOpen}
            onExitVersionView={onExitVersionView}
            onRestoreVersion={onRestoreVersion}
            onToggleVersionHistory={handleToggleVersionHistory}
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
