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
  RhUiExportIcon,
  RhUiHistoryIcon,
  RhUiImportIcon,
  RhUiSaveFillIcon,
  RhUiTrashIcon,
  RhUiEllipsisVerticalFillIcon,
  RhUiAddSquareIcon,
} from '@patternfly/react-icons'
import { useCallback, useState, type Dispatch, type Ref } from 'react'

import type { BuilderAction } from './builderReducer'
import { EnabledWorkflowSwitch } from './EnabledWorkflowSwitch'
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
  dispatch: Dispatch<BuilderAction>
  markDirty: () => void
  handleToggleHistory: () => void
  handleToggleDetails: () => void
}>

function WorkflowKebabMenu({
  isNew,
  workflow,
  isKebabOpen,
  dispatch,
  markDirty,
  handleToggleHistory,
  handleToggleDetails,
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
              onClick={() => {
                importFileRef.current?.click()
                dispatch({ type: 'SET_KEBAB_OPEN', payload: false })
              }}
            >
              <Icon isInline style={{ marginRight: 'var(--pf-t--global--spacer--sm)' }}>
                <RhUiImportIcon />
              </Icon>
              Import workflow
            </DropdownItem>
            {!isNew && workflow?.id && (
              <DropdownItem
                onClick={() => {
                  dispatch({ type: 'SET_DELETE_DIALOG', payload: true })
                  dispatch({ type: 'SET_KEBAB_OPEN', payload: false })
                }}
                isDanger
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

type BuilderEditorToolbarProps = Readonly<{
  isNew: boolean
  workflow: { id: string } | undefined
  isPending: boolean
  isEnabled: boolean
  isKebabOpen: boolean
  isSavingToggle: boolean
  dispatch: Dispatch<BuilderAction>
  markDirty: () => void
  handleToggleHistory: () => void
  handleToggleDetails: () => void
  handleSaveWorkflow: (overrideIsEnabled?: boolean) => Promise<boolean>
  onToggleEnable: (checked: boolean) => void
  triggers?: { id: string; name?: string }[]
}>

/**
 * Toolbar actions for the workflow builder editor view.
 */
export function BuilderEditorToolbar({
  isNew,
  workflow,
  isPending,
  isEnabled,
  isKebabOpen,
  isSavingToggle,
  dispatch,
  markDirty,
  handleToggleHistory,
  handleToggleDetails,
  handleSaveWorkflow,
  onToggleEnable,
  triggers,
}: BuilderEditorToolbarProps) {
  const [isRunDropdownOpen, setIsRunDropdownOpen] = useState(false)
  const hasMultipleTriggers = (triggers?.length ?? 0) > 1

  const renderRunMenuToggle = useCallback(
    (toggleRef: Ref<MenuToggleElement>) => (
      <MenuToggle
        ref={toggleRef}
        variant="plain"
        onClick={() => setIsRunDropdownOpen((prev) => !prev)}
        isExpanded={isRunDropdownOpen}
        aria-label="Run workflow"
      >
        <Icon isInline>
          <RhUiPlayIcon />
        </Icon>{' '}
        Run
      </MenuToggle>
    ),
    [isRunDropdownOpen]
  )

  return (
    <>
      <Button
        variant="plain"
        onClick={() => {
          dispatch({
            type: 'OPEN_ADD_NODE_PANEL',
            payload: { sourceNodeId: null, replacementNodeId: null },
          })
        }}
        icon={
          <Icon isInline>
            <RhUiAddSquareIcon />
          </Icon>
        }
        iconPosition="start"
      >
        Add step
      </Button>

      {!isNew && workflow?.id && (
        <>
          <Divider orientation={{ default: 'vertical' }} />
          {hasMultipleTriggers ? (
            <Dropdown
              isOpen={isRunDropdownOpen}
              onOpenChange={setIsRunDropdownOpen}
              toggle={renderRunMenuToggle}
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
          ) : (
            <Button
              variant="plain"
              onClick={() => dispatch({ type: 'SET_CONFIRM_DIALOG', payload: true })}
              icon={
                <Icon isInline>
                  <RhUiPlayIcon />
                </Icon>
              }
              iconPosition="start"
            >
              Run
            </Button>
          )}
        </>
      )}

      <Divider orientation={{ default: 'vertical' }} />

      <Button
        variant="plain"
        onClick={() => handleSaveWorkflow()}
        isLoading={isPending}
        isAriaDisabled={isPending}
        icon={
          <Icon isInline>
            <RhUiSaveFillIcon />
          </Icon>
        }
        iconPosition="start"
      >
        {isPending ? 'Saving...' : 'Save'}
      </Button>

      {!isNew && (
        <>
          <Divider orientation={{ default: 'vertical' }} />
          <EnabledWorkflowSwitch isEnabled={isEnabled} isSaving={isSavingToggle} onToggle={onToggleEnable} />
        </>
      )}

      <Divider orientation={{ default: 'vertical' }} />
      <WorkflowKebabMenu
        isNew={isNew}
        workflow={workflow}
        isKebabOpen={isKebabOpen}
        dispatch={dispatch}
        markDirty={markDirty}
        handleToggleHistory={handleToggleHistory}
        handleToggleDetails={handleToggleDetails}
      />
    </>
  )
}
