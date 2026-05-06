import {
  Button,
  Divider,
  Dropdown,
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
  RhUiSaveFillIcon,
  RhUiTrashIcon,
  RhUiEllipsisVerticalFillIcon,
  RhUiAddSquareIcon,
} from '@patternfly/react-icons'
import { useCallback, type Dispatch, type Ref } from 'react'

import type { ProjectRead } from '../access/types'

import type { BuilderAction } from './builderReducer'
import { EnabledWorkflowSwitch } from './EnabledWorkflowSwitch'
import { RunHistoryToggleButton } from './RunHistoryToggleButton'

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

type BuilderEditorToolbarProps = Readonly<{
  isNew: boolean
  workflow: { id: string } | undefined
  isPending: boolean
  selectedProject: ProjectRead | null
  isEnabled: boolean
  isKebabOpen: boolean
  historyCardOpen: boolean
  isSavingToggle: boolean
  dispatch: Dispatch<BuilderAction>
  handleToggleHistory: () => void
  handleToggleDetails: () => void
  handleSaveWorkflow: (overrideIsEnabled?: boolean) => Promise<boolean>
  onToggleEnable: (checked: boolean) => void
}>

/**
 * Toolbar actions for the workflow builder editor view.
 */
export function BuilderEditorToolbar({
  isNew,
  workflow,
  isPending,
  selectedProject,
  isEnabled,
  isKebabOpen,
  historyCardOpen,
  isSavingToggle,
  dispatch,
  handleToggleHistory,
  handleToggleDetails,
  handleSaveWorkflow,
  onToggleEnable,
}: BuilderEditorToolbarProps) {
  const renderKebabMenuToggle = useCallback(
    (toggleRef: Ref<MenuToggleElement>) => (
      <WorkflowKebabToggle toggleRef={toggleRef} isKebabOpen={isKebabOpen} dispatch={dispatch} />
    ),
    [dispatch, isKebabOpen]
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
        Add Step
      </Button>

      {!isNew && workflow?.id && (
        <>
          <Divider orientation={{ default: 'vertical' }} />
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
        </>
      )}

      <Divider orientation={{ default: 'vertical' }} />

      <Tooltip content="Workflow details">
        <Button
          variant="plain"
          onClick={handleToggleDetails}
          icon={
            <Icon isInline>
              <RhUiCodeIcon />
            </Icon>
          }
          aria-label="Workflow details"
        />
      </Tooltip>

      {!isNew && workflow?.id && <RunHistoryToggleButton onClick={handleToggleHistory} isActive={historyCardOpen} />}

      <Divider orientation={{ default: 'vertical' }} />

      <Tooltip
        content="Select a project before saving"
        trigger={isNew && !selectedProject ? 'mouseenter focus' : 'manual'}
      >
        <Button
          variant="plain"
          onClick={() => handleSaveWorkflow()}
          isAriaDisabled={isPending || (isNew && !selectedProject)}
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

      {!isNew && (
        <>
          <Divider orientation={{ default: 'vertical' }} />
          <EnabledWorkflowSwitch isEnabled={isEnabled} isSaving={isSavingToggle} onToggle={onToggleEnable} />
        </>
      )}

      {!isNew && workflow?.id && (
        <>
          <Divider orientation={{ default: 'vertical' }} />
          <Dropdown
            isOpen={isKebabOpen}
            onOpenChange={(isOpen) => dispatch({ type: 'SET_KEBAB_OPEN', payload: isOpen })}
            popperProps={{ position: 'right' }}
            toggle={renderKebabMenuToggle}
          >
            <DropdownList>
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
            </DropdownList>
          </Dropdown>
        </>
      )}
    </>
  )
}
