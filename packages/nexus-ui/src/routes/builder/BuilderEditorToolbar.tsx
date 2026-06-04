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
  Tooltip,
} from '@patternfly/react-core'
import {
  RhUiPlayIcon,
  RhUiCodeIcon,
  RhUiExportIcon,
  RhUiHistoryIcon,
  RhUiImportIcon,
  RhUiPublishIcon,
  RhUiSaveFillIcon,
  RhUiTrashIcon,
  RhUiEllipsisVerticalFillIcon,
  RhUiAddSquareIcon,
  RhUiMinusCircleFillIcon,
} from '@patternfly/react-icons'
import { useCallback, useState, type Dispatch, type Ref } from 'react'

import { DisabledWithTooltip } from '../../components/DisabledWithTooltip'
import { formatDateTime } from '../../utils/dateUtils'

import type { BuilderAction } from './builderReducer'
import type { BuilderPermissions } from './useBuilderPermissions'
import { useWorkflowImportExport } from './useWorkflowImportExport'

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
  isNew: boolean
  workflow: { id: string } | undefined
  isKebabOpen: boolean
  publishedVersion: number | null
  dispatch: Dispatch<BuilderAction>
  markDirty: () => void
  handleToggleHistory: () => void
  handleToggleDetails: () => void
  onUnpublish: () => void
  builderPermissions: BuilderPermissions
}>

function WorkflowKebabMenu({
  isNew,
  workflow,
  isKebabOpen,
  publishedVersion,
  dispatch,
  markDirty,
  handleToggleHistory,
  handleToggleDetails,
  onUnpublish,
  builderPermissions,
}: WorkflowKebabMenuProps) {
  const { importFileRef, handleImportFile, handleExport } = useWorkflowImportExport({ dispatch, markDirty })

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
        <Divider />
        <DropdownGroup label="Actions">
          <DropdownList>
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
      </Dropdown>
      <input ref={importFileRef} type="file" accept=".json" onChange={handleImportFile} style={{ display: 'none' }} />
    </>
  )
}

type SaveWorkflowButtonProps = Readonly<{
  isPending: boolean
  isDirty: boolean
  isNew: boolean
  lastSavedAt?: string | null
  onSave: () => void
  canEdit: boolean
  editTooltip: string
}>

function SaveWorkflowButton({
  isPending,
  isDirty,
  isNew,
  lastSavedAt,
  onSave,
  canEdit,
  editTooltip,
}: SaveWorkflowButtonProps) {
  const isDisabledByState = isPending || (!isDirty && !isNew)

  let tooltipContent: string
  if (!canEdit) {
    tooltipContent = editTooltip
  } else if (lastSavedAt) {
    tooltipContent = `Last saved ${formatDateTime(lastSavedAt)}`
  } else {
    tooltipContent = 'Save workflow'
  }

  return (
    <Tooltip content={tooltipContent} position="bottom" enableFlip={false}>
      <Button
        variant="plain"
        onClick={canEdit ? onSave : undefined}
        isLoading={isPending}
        isAriaDisabled={!canEdit || isDisabledByState}
        icon={
          <Icon isInline>
            <RhUiSaveFillIcon />
          </Icon>
        }
        iconPosition="start"
      >
        {isPending ? 'Saving...' : 'Save'}
      </Button>
    </Tooltip>
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
  triggers?: { id: string; name?: string }[]
  builderPermissions: BuilderPermissions
}>

export function BuilderEditorToolbar({
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
  triggers,
  builderPermissions,
}: BuilderEditorToolbarProps) {
  if (!builderPermissions.canEdit && hasNoWorkflowNodes && isNew) {
    return null
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
          <DisabledWithTooltip isDisabled={!builderPermissions.canEdit} content={builderPermissions.tooltips.publish}>
            <Button
              variant="primary"
              isAriaDisabled={!builderPermissions.canEdit}
              onClick={builderPermissions.canEdit ? onPublishClick : undefined}
              icon={
                <Icon isInline>
                  <RhUiPublishIcon />
                </Icon>
              }
              iconPosition="start"
            >
              Publish workflow
            </Button>
          </DisabledWithTooltip>
        </>
      )}

      <Divider orientation={{ default: 'vertical' }} />
      <WorkflowKebabMenu
        isNew={isNew}
        workflow={workflow}
        isKebabOpen={isKebabOpen}
        publishedVersion={publishedVersion}
        dispatch={dispatch}
        markDirty={markDirty}
        handleToggleHistory={handleToggleHistory}
        handleToggleDetails={handleToggleDetails}
        onUnpublish={onUnpublish}
        builderPermissions={builderPermissions}
      />
    </>
  )
}
