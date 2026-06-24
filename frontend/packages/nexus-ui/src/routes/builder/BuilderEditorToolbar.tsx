import {
  Button,
  Divider,
  Dropdown,
  DropdownGroup,
  DropdownItem,
  DropdownList,
  Icon,
  MenuToggle,
  type MenuToggleElement,
} from '@patternfly/react-core'
import {
  RhUiPlayIcon,
  RhUiCodeIcon,
  RhUiCheckCircleIcon,
  RhUiExportIcon,
  RhUiHistoryIcon,
  RhUiImportIcon,
  RhUiTrashIcon,
  RhUiEllipsisVerticalFillIcon,
  RhUiAddSquareIcon,
  RhUiMinusCircleFillIcon,
} from '@patternfly/react-icons'
import { useCallback, useState, type Dispatch, type Ref } from 'react'

import { DisabledWithTooltip } from '../../components/DisabledWithTooltip'

import type { BuilderAction } from './builderReducer'
import { PublishWorkflowButton } from './PublishWorkflowButton'
import { SaveWorkflowButton } from './SaveWorkflowButton'
import type { BuilderPermissions } from './useBuilderPermissions'
import { useWorkflowImportExport, type PendingImportData } from './useWorkflowImportExport'

type WorkflowKebabToggleProps = Readonly<{
  toggleRef: Ref<MenuToggleElement>
  isKebabOpen: boolean
  dispatch: Dispatch<BuilderAction>
}>

function WorkflowKebabToggle({ toggleRef, isKebabOpen, dispatch }: WorkflowKebabToggleProps) {
  return (
    <MenuToggle
      ref={toggleRef}
      variant="plain"
      onClick={() => dispatch({ type: 'SET_KEBAB_OPEN', payload: !isKebabOpen })}
      isExpanded={isKebabOpen}
      aria-label="Workflow actions"
    >
      <RhUiEllipsisVerticalFillIcon />
    </MenuToggle>
  )
}

type WorkflowKebabMenuProps = Readonly<{
  isBuiltin: boolean
  isNew: boolean
  workflow: { id: string } | undefined
  isKebabOpen: boolean
  publishedVersion: number | null
  dispatch: Dispatch<BuilderAction>
  handleToggleHistory: () => void
  handleToggleDetails: () => void
  onUnpublish: () => void
  builderPermissions: BuilderPermissions
  importFileRef: React.RefObject<HTMLInputElement | null>
  handleImportFile: (event: React.ChangeEvent<HTMLInputElement>) => void
  handleExport: () => void
  handleVerify: (onValid?: () => void) => void
}>

function WorkflowKebabMenu({
  isBuiltin,
  isNew,
  workflow,
  isKebabOpen,
  publishedVersion,
  dispatch,
  handleToggleHistory,
  handleToggleDetails,
  onUnpublish,
  builderPermissions,
  importFileRef,
  handleImportFile,
  handleExport,
  handleVerify,
}: WorkflowKebabMenuProps) {
  const renderKebabMenuToggle = useCallback(
    (toggleRef: Ref<MenuToggleElement>) => (
      <WorkflowKebabToggle toggleRef={toggleRef} isKebabOpen={isKebabOpen} dispatch={dispatch} />
    ),
    [dispatch, isKebabOpen]
  )

  return (
    <>
      <Dropdown
        isOpen={isKebabOpen}
        onOpenChange={(isOpen) => dispatch({ type: 'SET_KEBAB_OPEN', payload: isOpen })}
        popperProps={{ position: 'right' }}
        toggle={renderKebabMenuToggle}
      >
        <DropdownGroup label="Views">
          <DropdownList>
            {!isNew && workflow?.id && (
              <DropdownItem
                onClick={() => {
                  handleToggleHistory()
                  dispatch({ type: 'SET_KEBAB_OPEN', payload: false })
                }}
              >
                <Icon isInline style={{ marginRight: 'var(--pf-t--global--spacer--sm)' }}>
                  <RhUiHistoryIcon />
                </Icon>
                Run history
              </DropdownItem>
            )}
            <DropdownItem
              onClick={() => {
                handleToggleDetails()
                dispatch({ type: 'SET_KEBAB_OPEN', payload: false })
              }}
            >
              <Icon isInline style={{ marginRight: 'var(--pf-t--global--spacer--sm)' }}>
                <RhUiCodeIcon />
              </Icon>
              Workflow details
            </DropdownItem>
          </DropdownList>
        </DropdownGroup>
        {!isBuiltin && <Divider />}
        {!isBuiltin && (
          <DropdownGroup label="Actions">
            <DropdownList>
              <DropdownItem onClick={() => handleVerify()}>
                <Icon isInline style={{ marginRight: 'var(--pf-t--global--spacer--sm)' }}>
                  <RhUiCheckCircleIcon />
                </Icon>
                Verify workflow
              </DropdownItem>
              <DropdownItem onClick={handleExport}>
                <Icon isInline style={{ marginRight: 'var(--pf-t--global--spacer--sm)' }}>
                  <RhUiExportIcon />
                </Icon>
                Export workflow
              </DropdownItem>
              <DropdownItem
                isAriaDisabled={!builderPermissions.canEdit}
                tooltipProps={builderPermissions.canEdit ? undefined : { content: builderPermissions.tooltips.edit }}
                onClick={
                  builderPermissions.canEdit
                    ? () => {
                        importFileRef.current?.click()
                        dispatch({ type: 'SET_KEBAB_OPEN', payload: false })
                      }
                    : undefined
                }
              >
                <Icon isInline style={{ marginRight: 'var(--pf-t--global--spacer--sm)' }}>
                  <RhUiImportIcon />
                </Icon>
                Import workflow
              </DropdownItem>
              {!isNew && workflow?.id && publishedVersion != null && (
                <DropdownItem
                  isAriaDisabled={!builderPermissions.canEdit}
                  tooltipProps={
                    builderPermissions.canEdit ? undefined : { content: builderPermissions.tooltips.unpublish }
                  }
                  onClick={
                    builderPermissions.canEdit
                      ? () => {
                          onUnpublish()
                          dispatch({ type: 'SET_KEBAB_OPEN', payload: false })
                        }
                      : undefined
                  }
                >
                  <Icon isInline style={{ marginRight: 'var(--pf-t--global--spacer--sm)' }}>
                    <RhUiMinusCircleFillIcon />
                  </Icon>
                  Unpublish workflow
                </DropdownItem>
              )}
              {!isNew && workflow?.id && (
                <DropdownItem
                  isAriaDisabled={!builderPermissions.canDelete}
                  tooltipProps={
                    builderPermissions.canDelete ? undefined : { content: builderPermissions.tooltips.delete }
                  }
                  onClick={
                    builderPermissions.canDelete
                      ? () => {
                          dispatch({ type: 'SET_DELETE_DIALOG', payload: true })
                          dispatch({ type: 'SET_KEBAB_OPEN', payload: false })
                        }
                      : undefined
                  }
                  isDanger={builderPermissions.canDelete}
                >
                  <Icon isInline style={{ marginRight: 'var(--pf-t--global--spacer--sm)' }}>
                    <RhUiTrashIcon />
                  </Icon>
                  Delete workflow
                </DropdownItem>
              )}
            </DropdownList>
          </DropdownGroup>
        )}
      </Dropdown>
      <input ref={importFileRef} type="file" accept=".json" onChange={handleImportFile} style={{ display: 'none' }} />
    </>
  )
}

type RunMenuToggleProps = Readonly<{
  toggleRef: Ref<MenuToggleElement>
  isExpanded: boolean
  isDisabled: boolean
  onClick: (() => void) | undefined
}>

function RunMenuToggle({ toggleRef, isExpanded, isDisabled, onClick }: RunMenuToggleProps) {
  return (
    <MenuToggle
      ref={toggleRef}
      variant="plain"
      onClick={onClick}
      isExpanded={isExpanded}
      isDisabled={isDisabled}
      aria-label="Run workflow"
    >
      <Icon isInline>
        <RhUiPlayIcon />
      </Icon>{' '}
      Run
    </MenuToggle>
  )
}

type RunWorkflowSectionProps = Readonly<{
  triggers?: { id: string; name?: string }[]
  dispatch: Dispatch<BuilderAction>
  builderPermissions: BuilderPermissions
}>

function RunWorkflowSection({ triggers, dispatch, builderPermissions }: RunWorkflowSectionProps) {
  const [isRunDropdownOpen, setIsRunDropdownOpen] = useState(false)
  const hasMultipleTriggers = (triggers?.length ?? 0) > 1

  const renderRunToggle = useCallback(
    (toggleRef: Ref<MenuToggleElement>) => (
      <RunMenuToggle
        toggleRef={toggleRef}
        isExpanded={isRunDropdownOpen}
        isDisabled={!builderPermissions.canRun}
        onClick={builderPermissions.canRun ? () => setIsRunDropdownOpen((prev) => !prev) : undefined}
      />
    ),
    [isRunDropdownOpen, builderPermissions.canRun]
  )

  if (hasMultipleTriggers) {
    return (
      <DisabledWithTooltip isDisabled={!builderPermissions.canRun} content={builderPermissions.tooltips.run}>
        <Dropdown
          isOpen={isRunDropdownOpen}
          onOpenChange={setIsRunDropdownOpen}
          toggle={renderRunToggle}
          popperProps={{ position: 'left' }}
        >
          <DropdownList>
            {triggers?.map((trigger, index) => (
              <DropdownItem
                key={trigger.id}
                onClick={() => {
                  dispatch({ type: 'SET_SELECTED_TRIGGER', payload: index })
                  dispatch({ type: 'SET_CONFIRM_DIALOG', payload: true })
                  setIsRunDropdownOpen(false)
                }}
              >
                {trigger.name ?? `Trigger ${index + 1}`}
              </DropdownItem>
            ))}
          </DropdownList>
        </Dropdown>
      </DisabledWithTooltip>
    )
  }

  return (
    <DisabledWithTooltip isDisabled={!builderPermissions.canRun} content={builderPermissions.tooltips.run}>
      <Button
        variant="plain"
        isAriaDisabled={!builderPermissions.canRun}
        onClick={builderPermissions.canRun ? () => dispatch({ type: 'SET_CONFIRM_DIALOG', payload: true }) : undefined}
        icon={
          <Icon isInline>
            <RhUiPlayIcon />
          </Icon>
        }
        iconPosition="start"
      >
        Run
      </Button>
    </DisabledWithTooltip>
  )
}

type BuilderEditorToolbarProps = Readonly<{
  isBuiltin: boolean
  isNew: boolean
  workflow: { id: string } | undefined
  isPending: boolean
  isDirty: boolean
  lastSavedAt?: string | null
  isKebabOpen: boolean
  publishedVersion: number | null
  isAddNodePanelOpen: boolean
  hasNoWorkflowNodes: boolean
  dispatch: Dispatch<BuilderAction>
  markDirty: () => void
  handleToggleHistory: () => void
  handleToggleDetails: () => void
  handleSaveWorkflow: () => Promise<boolean>
  onPublishClick: () => void
  onUnpublish: () => void
  onPendingImport: (data: PendingImportData) => void
  triggers?: { id: string; name?: string }[]
  builderPermissions: BuilderPermissions
}>

export function BuilderEditorToolbar({
  isBuiltin,
  isNew,
  workflow,
  isPending,
  isDirty,
  lastSavedAt,
  isKebabOpen,
  publishedVersion,
  isAddNodePanelOpen,
  hasNoWorkflowNodes,
  dispatch,
  markDirty,
  handleToggleHistory,
  handleToggleDetails,
  handleSaveWorkflow,
  onPublishClick,
  onUnpublish,
  onPendingImport,
  triggers,
  builderPermissions,
}: BuilderEditorToolbarProps) {
  const { importFileRef, handleImportFile, handleExport, handleVerify, isVerifying, validationErrorCount } =
    useWorkflowImportExport({
      dispatch,
      markDirty,
      isNew,
      onPendingImport,
    })

  if (!builderPermissions.canEdit && hasNoWorkflowNodes && isNew) {
    return null
  }

  if (isBuiltin) {
    return (
      <WorkflowKebabMenu
        isBuiltin={isBuiltin}
        isNew={isNew}
        workflow={workflow}
        isKebabOpen={isKebabOpen}
        publishedVersion={publishedVersion}
        dispatch={dispatch}
        handleToggleHistory={handleToggleHistory}
        handleToggleDetails={handleToggleDetails}
        onUnpublish={onUnpublish}
        builderPermissions={builderPermissions}
        importFileRef={importFileRef}
        handleImportFile={handleImportFile}
        handleExport={handleExport}
        handleVerify={handleVerify}
      />
    )
  }

  return (
    <>
      {!hasNoWorkflowNodes && (
        <DisabledWithTooltip isDisabled={!builderPermissions.canEdit} content={builderPermissions.tooltips.edit}>
          <Button
            variant="plain"
            isClicked={isAddNodePanelOpen}
            aria-pressed={isAddNodePanelOpen}
            isAriaDisabled={!builderPermissions.canEdit}
            onClick={
              builderPermissions.canEdit
                ? () => {
                    dispatch({
                      type: 'OPEN_ADD_NODE_PANEL',
                      payload: { sourceNodeId: null, replacementNodeId: null },
                    })
                  }
                : undefined
            }
            icon={
              <Icon isInline>
                <RhUiAddSquareIcon />
              </Icon>
            }
            iconPosition="start"
          >
            Add step
          </Button>
        </DisabledWithTooltip>
      )}

      {!isNew && workflow?.id && (
        <>
          {!hasNoWorkflowNodes && <Divider orientation={{ default: 'vertical' }} />}
          <RunWorkflowSection triggers={triggers} dispatch={dispatch} builderPermissions={builderPermissions} />
        </>
      )}

      {(!hasNoWorkflowNodes || (!isNew && workflow?.id)) && <Divider orientation={{ default: 'vertical' }} />}

      <SaveWorkflowButton
        isPending={isPending}
        isDirty={isDirty}
        isNew={isNew}
        lastSavedAt={lastSavedAt}
        onSave={handleSaveWorkflow}
        canEdit={builderPermissions.canEdit}
        editTooltip={builderPermissions.tooltips.save}
      />

      {!isNew && workflow?.id && (
        <>
          <Divider orientation={{ default: 'vertical' }} />
          <PublishWorkflowButton
            canEdit={builderPermissions.canEdit}
            validationErrorCount={validationErrorCount}
            isVerifying={isVerifying}
            editTooltip={builderPermissions.tooltips.publish}
            handleVerify={handleVerify}
            onPublishClick={onPublishClick}
          />
        </>
      )}

      {isVerifying && (
        <>
          <Divider orientation={{ default: 'vertical' }} />
          <Button variant="plain" isLoading isAriaDisabled>
            Verifying...
          </Button>
        </>
      )}

      <Divider orientation={{ default: 'vertical' }} />
      <WorkflowKebabMenu
        isBuiltin={isBuiltin}
        isNew={isNew}
        workflow={workflow}
        isKebabOpen={isKebabOpen}
        publishedVersion={publishedVersion}
        dispatch={dispatch}
        handleToggleHistory={handleToggleHistory}
        handleToggleDetails={handleToggleDetails}
        onUnpublish={onUnpublish}
        builderPermissions={builderPermissions}
        importFileRef={importFileRef}
        handleImportFile={handleImportFile}
        handleExport={handleExport}
        handleVerify={handleVerify}
      />
    </>
  )
}
