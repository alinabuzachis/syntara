import {
  Button,
  Divider,
  Dropdown,
  DropdownItem,
  DropdownList,
  Flex,
  FlexItem,
  Icon,
  Label,
  MenuToggle,
  type MenuToggleElement,
  Switch,
  TextInput,
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
import { useCallback, type Dispatch, type ReactNode, type Ref } from 'react'

import { AppPageHeader } from '../../app/AppPageHeader'
import type { ProjectRead } from '../access/types'

import type { BuilderAction } from './builderReducer'
import { EditAutomationDetailsPopover } from './EditAutomationDetailsPopover'
import { formatHistoryDateTime } from './historyDateUtils'
import { RunHistoryToggleButton } from './RunHistoryToggleButton'

/**
 * Header props are intentionally flat for this extraction; many fields mirror `BuilderContent` state.
 * Follow-up: consider grouping (e.g. `toolbarHandlers`) or builder-scoped context to trim prop drilling
 * without re-inflating `BuilderContent` cognitive complexity — see PR review discussion.
 */
export type BuilderWorkflowAppPageHeaderProps = Readonly<{
  workflowName: string
  workflowDescription: string
  workflowTags: string[]
  isNew: boolean
  workflow: { id: string } | undefined
  isViewingExecution: boolean
  selectedExecutionCreatedAt: string | undefined
  historyCardOpen: boolean
  isPending: boolean
  selectedProject: ProjectRead | null
  isEnabled: boolean
  isKebabOpen: boolean
  ProjectSelector: ReactNode
  dispatch: Dispatch<BuilderAction>
  markDirty: () => void
  handleToggleHistory: () => void
  handleToggleDetails: () => void
  handleSaveWorkflow: () => void
}>

type AutomationKebabToggleProps = Readonly<{
  toggleRef: Ref<MenuToggleElement>
  isKebabOpen: boolean
  dispatch: Dispatch<BuilderAction>
}>

function AutomationKebabToggle({ toggleRef, isKebabOpen, dispatch }: AutomationKebabToggleProps) {
  return (
    <MenuToggle
      ref={toggleRef}
      variant="plain"
      onClick={() => dispatch({ type: 'SET_KEBAB_OPEN', payload: !isKebabOpen })}
      isExpanded={isKebabOpen}
      aria-label="Automation actions"
    >
      <RhUiEllipsisVerticalFillIcon />
    </MenuToggle>
  )
}

/**
 * Builder page title row (name, project, details) and primary toolbar actions.
 */
export function BuilderWorkflowAppPageHeader({
  workflowName,
  workflowDescription,
  workflowTags,
  isNew,
  workflow,
  isViewingExecution,
  selectedExecutionCreatedAt,
  historyCardOpen,
  isPending,
  selectedProject,
  isEnabled,
  isKebabOpen,
  ProjectSelector,
  dispatch,
  markDirty,
  handleToggleHistory,
  handleToggleDetails,
  handleSaveWorkflow,
}: BuilderWorkflowAppPageHeaderProps) {
  const renderKebabMenuToggle = useCallback(
    (toggleRef: Ref<MenuToggleElement>) => (
      <AutomationKebabToggle toggleRef={toggleRef} isKebabOpen={isKebabOpen} dispatch={dispatch} />
    ),
    [dispatch, isKebabOpen]
  )

  return (
    <AppPageHeader
      title={
        <Flex gap={{ default: 'gapMd' }} alignItems={{ default: 'alignItemsCenter' }}>
          <FlexItem>
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
          <FlexItem>{ProjectSelector}</FlexItem>
          <FlexItem>
            <EditAutomationDetailsPopover
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
          {isViewingExecution && selectedExecutionCreatedAt && (
            <FlexItem>
              <Label>{`Viewing run: ${formatHistoryDateTime(selectedExecutionCreatedAt)}`}</Label>
            </FlexItem>
          )}
        </Flex>
      }
    >
      {isViewingExecution ? (
        <>
          <RunHistoryToggleButton onClick={handleToggleHistory} isActive={historyCardOpen} />

          <Button
            variant="primary"
            onClick={() => {
              dispatch({ type: 'SET_SELECTED_EXECUTION_ID', payload: null })
              dispatch({ type: 'SET_HISTORY_CARD_OPEN', payload: false })
            }}
          >
            Back to editor
          </Button>
        </>
      ) : (
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

          {!isNew && workflow?.id && <RunHistoryToggleButton onClick={handleToggleHistory} />}

          <Divider orientation={{ default: 'vertical' }} />

          <Tooltip
            content="Select a project before saving"
            trigger={isNew && !selectedProject ? 'mouseenter focus' : 'manual'}
          >
            <Button
              variant="plain"
              onClick={handleSaveWorkflow}
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
              <Switch
                isChecked={isEnabled}
                onChange={(_event, checked) => {
                  dispatch({ type: 'SET_IS_ENABLED', payload: checked })
                  markDirty()
                }}
                label={isEnabled ? 'Enabled' : 'Disabled'}
              />
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
                    Delete automation
                  </DropdownItem>
                </DropdownList>
              </Dropdown>
            </>
          )}
        </>
      )}
    </AppPageHeader>
  )
}
