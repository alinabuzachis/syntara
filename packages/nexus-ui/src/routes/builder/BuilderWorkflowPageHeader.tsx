import { Button, Flex, FlexItem, TextInput } from '@patternfly/react-core'
import { useState, type Dispatch, type ReactNode } from 'react'

import { NxPageHeader } from '../../components/layout/NxPageHeader'
import { useWorkflowStore } from '../../stores/useWorkflowStore'

import { BuilderEditorToolbar } from './BuilderEditorToolbar'
import type { BuilderAction } from './builderReducer'
import { EditWorkflowDetailsPopover } from './EditWorkflowDetailsPopover'
import { EnableWorkflowConfirmDialog } from './EnableWorkflowConfirmDialog'

type BuilderToolbarContentProps = Readonly<{
  isLiveRunActive?: boolean
  hasApprovalPending?: boolean
  isApprovalLoading?: boolean
  onBackToEditor?: () => void
  onReviewApproval?: () => void
  dispatch: Dispatch<BuilderAction>
  markDirty: () => void
  handleToggleHistory: () => void
  isNew: boolean
  workflow: { id: string } | undefined
  isPending: boolean
  isEnabled: boolean
  isKebabOpen: boolean
  isSavingToggle: boolean
  handleToggleDetails: () => void
  handleSaveWorkflow: (overrideIsEnabled?: boolean) => Promise<boolean>
  handleToggleEnable: (checked: boolean) => void
  triggers?: { id: string; name?: string }[]
}>

/**
 * Renders appropriate toolbar based on builder state:
 * - Live run active: optional approval review + back button
 * - Default: full editor toolbar
 */
function BuilderToolbarContent({
  isLiveRunActive,
  hasApprovalPending,
  isApprovalLoading,
  onBackToEditor,
  onReviewApproval,
  dispatch,
  markDirty,
  handleToggleHistory,
  isNew,
  workflow,
  isPending,
  isEnabled,
  isKebabOpen,
  isSavingToggle,
  handleToggleDetails,
  handleSaveWorkflow,
  handleToggleEnable,
  triggers,
}: BuilderToolbarContentProps) {
  if (isLiveRunActive && onBackToEditor) {
    return (
      <>
        {hasApprovalPending && onReviewApproval && (
          <Button variant="warning" onClick={onReviewApproval} isLoading={isApprovalLoading}>
            Review approval
          </Button>
        )}
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
      isEnabled={isEnabled}
      isKebabOpen={isKebabOpen}
      isSavingToggle={isSavingToggle}
      dispatch={dispatch}
      markDirty={markDirty}
      handleToggleHistory={handleToggleHistory}
      handleToggleDetails={handleToggleDetails}
      handleSaveWorkflow={handleSaveWorkflow}
      onToggleEnable={handleToggleEnable}
      triggers={triggers}
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
  isEnabled: boolean
  isKebabOpen: boolean
  isLiveRunActive?: boolean
  onBackToEditor?: () => void
  hasApprovalPending?: boolean
  isApprovalLoading?: boolean
  onReviewApproval?: () => void
  triggers?: { id: string; name?: string }[]
  ProjectSelector: ReactNode
  dispatch: Dispatch<BuilderAction>
  markDirty: () => void
  handleToggleHistory: () => void
  handleToggleDetails: () => void
  handleSaveWorkflow: (overrideIsEnabled?: boolean) => Promise<boolean>
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
  isEnabled,
  isKebabOpen,
  isLiveRunActive,
  onBackToEditor,
  hasApprovalPending,
  isApprovalLoading,
  onReviewApproval,
  triggers,
  ProjectSelector,
  dispatch,
  markDirty,
  handleToggleHistory,
  handleToggleDetails,
  handleSaveWorkflow,
}: BuilderWorkflowPageHeaderProps) {
  const [isSavingToggle, setIsSavingToggle] = useState(false)
  const [enableConfirmOpen, setEnableConfirmOpen] = useState(false)
  const [pendingEnableState, setPendingEnableState] = useState<boolean | null>(null)

  const handleToggleEnable = async (checked: boolean) => {
    // Re-entry guard: ignore clicks while save is in progress
    if (isSavingToggle) {
      return
    }

    const currentIsDirty = useWorkflowStore.getState().isDirty

    if (currentIsDirty) {
      // Show dialog - there are other unsaved changes
      setPendingEnableState(checked)
      setEnableConfirmOpen(true)
    } else {
      // No other changes - save immediately with the new enabled state
      setIsSavingToggle(true)
      const saved = await handleSaveWorkflow(checked)
      setIsSavingToggle(false)

      if (saved) {
        // Update UI state to match saved state
        dispatch({ type: 'SET_IS_ENABLED', payload: checked })
      }
      // If save failed, keep UI showing old state (don't update dispatch)
    }
  }

  return (
    <>
      <NxPageHeader
        title={workflowName}
        titleSlot={
          <Flex
            gap={{ default: 'gapMd' }}
            alignItems={{ default: 'alignItemsCenter' }}
            flexWrap={{ default: 'nowrap' }}
          >
            <FlexItem style={{ flexShrink: 1, minWidth: 0 }}>
              <TextInput
                id="workflow-name-input"
                type="text"
                aria-label="Workflow name"
                value={workflowName}
                onChange={(_event, value) => {
                  dispatch({ type: 'SET_WORKFLOW_NAME', payload: value })
                  markDirty()
                }}
                placeholder="Workflow name"
              />
            </FlexItem>
            <FlexItem style={{ flexShrink: 0 }}>
              <EditWorkflowDetailsPopover
                name={workflowName}
                description={workflowDescription}
                tags={workflowTags}
                onApply={(name, description, tags) => {
                  const nameChanged = name !== workflowName
                  const descriptionChanged = description !== workflowDescription
                  const tagsChanged = tags.length !== workflowTags.length || tags.some((t, i) => t !== workflowTags[i])
                  if (nameChanged) dispatch({ type: 'SET_WORKFLOW_NAME', payload: name })
                  if (descriptionChanged) dispatch({ type: 'SET_WORKFLOW_DESCRIPTION', payload: description })
                  if (tagsChanged) dispatch({ type: 'SET_WORKFLOW_TAGS', payload: tags })
                  if (nameChanged || descriptionChanged || tagsChanged) markDirty()
                }}
              />
            </FlexItem>
            <FlexItem style={{ flexShrink: 0 }}>{ProjectSelector}</FlexItem>
          </Flex>
        }
        toolbar={
          <BuilderToolbarContent
            isLiveRunActive={isLiveRunActive}
            hasApprovalPending={hasApprovalPending}
            isApprovalLoading={isApprovalLoading}
            onBackToEditor={onBackToEditor}
            onReviewApproval={onReviewApproval}
            dispatch={dispatch}
            markDirty={markDirty}
            handleToggleHistory={handleToggleHistory}
            isNew={isNew}
            workflow={workflow}
            isPending={isPending}
            isEnabled={isEnabled}
            isKebabOpen={isKebabOpen}
            isSavingToggle={isSavingToggle}
            handleToggleDetails={handleToggleDetails}
            handleSaveWorkflow={handleSaveWorkflow}
            handleToggleEnable={handleToggleEnable}
            triggers={triggers}
          />
        }
      />

      <EnableWorkflowConfirmDialog
        isOpen={enableConfirmOpen}
        pendingEnableState={pendingEnableState}
        isSaving={isSavingToggle}
        workflowName={workflowName}
        onClose={() => {
          setEnableConfirmOpen(false)
          setPendingEnableState(null)
        }}
        onConfirm={async () => {
          if (pendingEnableState === null) return

          setIsSavingToggle(true)
          // Save with the new enabled value
          const saved = await handleSaveWorkflow(pendingEnableState)
          setIsSavingToggle(false)

          if (saved) {
            // Update UI state to match saved state
            dispatch({ type: 'SET_IS_ENABLED', payload: pendingEnableState })
            setEnableConfirmOpen(false)
            setPendingEnableState(null)
          }
          // If save failed, leave dialog open and keep old state
        }}
      />
    </>
  )
}
