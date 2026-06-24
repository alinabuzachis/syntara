import { EdgeHandleEnum } from '@ansible/nexus-contracts'
import { Button, Dropdown, DropdownItem, DropdownList, Icon, MenuToggle, Tooltip } from '@patternfly/react-core'
import type { MenuToggleElement } from '@patternfly/react-core'
import { RhUiAddIcon } from '@patternfly/react-icons'
import { useCallback, useState, type Ref } from 'react'

import { FlowNodeType } from '../../../constants/nodeTypes'

import styles from './RightSidePill.module.css'

type BranchHandle = {
  handle: string
  label: string
}

/**
 * Maps branching node types to their output handles.
 * Each handle has a string value (from EdgeHandleEnum) and a human-readable label.
 */
const BRANCHING_HANDLES: Record<string, BranchHandle[]> = {
  [FlowNodeType.CONDITION]: [
    { handle: EdgeHandleEnum.TRUE, label: 'On True' },
    { handle: EdgeHandleEnum.FALSE, label: 'On False' },
  ],
  [FlowNodeType.APPROVAL]: [
    { handle: EdgeHandleEnum.APPROVED, label: 'On Approved' },
    { handle: EdgeHandleEnum.REJECTED, label: 'On Rejected' },
  ],
  [FlowNodeType.LOOP]: [
    { handle: EdgeHandleEnum.LOOP, label: 'In loop' },
    { handle: EdgeHandleEnum.DONE, label: 'On done' },
  ],
}

type RightSidePillProps = {
  nodeFlowType?: string
  onAddStep?: (handle?: string) => void
}

type AddStepToggleProps = {
  toggleRef: Ref<MenuToggleElement>
  tooltip: string
  isOpen: boolean
  onToggle: () => void
}

function AddStepToggle({ toggleRef, tooltip, isOpen, onToggle }: Readonly<AddStepToggleProps>) {
  return (
    <Tooltip content={tooltip}>
      <MenuToggle
        ref={toggleRef}
        variant="plain"
        className={styles.addStepButton}
        aria-label={tooltip}
        isExpanded={isOpen}
        onClick={onToggle}
      >
        <Icon isInline>
          <RhUiAddIcon />
        </Icon>
      </MenuToggle>
    </Tooltip>
  )
}

type BranchingAddStepProps = {
  handles: BranchHandle[]
  onAddStep: (handle: string) => void
}

function BranchingAddStep({ handles, onAddStep }: Readonly<BranchingAddStepProps>) {
  const [isOpen, setIsOpen] = useState(false)
  const tooltip = 'Add step…'

  const handleSelect = useCallback(
    (handle: string) => {
      onAddStep(handle)
      setIsOpen(false)
    },
    [onAddStep]
  )

  const handleToggleOpen = useCallback(() => setIsOpen((prev) => !prev), [])

  const renderToggle = useCallback(
    (toggleRef: Ref<MenuToggleElement>) => (
      <AddStepToggle toggleRef={toggleRef} tooltip={tooltip} isOpen={isOpen} onToggle={handleToggleOpen} />
    ),
    [tooltip, isOpen, handleToggleOpen]
  )

  return (
    <Dropdown isOpen={isOpen} onOpenChange={setIsOpen} popperProps={{ placement: 'bottom-end' }} toggle={renderToggle}>
      <DropdownList>
        {handles.map((item) => (
          <DropdownItem key={item.handle} onClick={() => handleSelect(item.handle)}>
            {item.label}
          </DropdownItem>
        ))}
      </DropdownList>
    </Dropdown>
  )
}

type NonBranchingAddStepProps = {
  onAddStep: () => void
}

function NonBranchingAddStep({ onAddStep }: Readonly<NonBranchingAddStepProps>) {
  return (
    <Tooltip content="Add step">
      <Button
        variant="plain"
        type="button"
        className={styles.addStepButton}
        icon={
          <Icon isInline>
            <RhUiAddIcon />
          </Icon>
        }
        aria-label="Add step"
        onClick={onAddStep}
      />
    </Tooltip>
  )
}

export function RightSidePill({ nodeFlowType, onAddStep }: Readonly<RightSidePillProps>) {
  if (!onAddStep) {
    return null
  }

  const branchHandles = nodeFlowType && nodeFlowType in BRANCHING_HANDLES ? BRANCHING_HANDLES[nodeFlowType] : undefined

  if (branchHandles && branchHandles.length > 0) {
    return <BranchingAddStep handles={branchHandles} onAddStep={onAddStep} />
  }

  return <NonBranchingAddStep onAddStep={() => onAddStep()} />
}
