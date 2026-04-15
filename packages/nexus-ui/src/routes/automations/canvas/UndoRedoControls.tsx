import { Button, CompassPanel, Flex, FlexItem, Icon, Tooltip } from '@patternfly/react-core'
import { RhUiUndoIcon, RhUiRedoIcon } from '@patternfly/react-icons'
import { Panel } from '@xyflow/react'

import { useWorkflowHistory } from '../../../stores/workflowStoreSelectors'

const isMac = navigator.userAgent.includes('Mac')
const UNDO_SHORTCUT_LABEL = isMac ? '⌘Z' : 'Ctrl+Z'
const REDO_SHORTCUT_LABEL = isMac ? '⌘⇧Z' : 'Ctrl+Y'

export function UndoRedoControls() {
  const { undo, redo, canUndo, canRedo } = useWorkflowHistory()

  return (
    <Panel position="bottom-center">
      <CompassPanel isPill hasNoPadding>
        <Flex role="toolbar" aria-label="Undo and redo" gap={{ default: 'gapNone' }}>
          <FlexItem>
            <Tooltip content={`Undo (${UNDO_SHORTCUT_LABEL})`}>
              <Button
                variant="plain"
                onClick={() => undo()}
                isDisabled={!canUndo}
                aria-label="Undo"
                icon={
                  <Icon isInline>
                    <RhUiUndoIcon />
                  </Icon>
                }
              />
            </Tooltip>
          </FlexItem>
          <FlexItem>
            <Tooltip content={`Redo (${REDO_SHORTCUT_LABEL})`}>
              <Button
                variant="plain"
                onClick={() => redo()}
                isDisabled={!canRedo}
                aria-label="Redo"
                icon={
                  <Icon isInline>
                    <RhUiRedoIcon />
                  </Icon>
                }
              />
            </Tooltip>
          </FlexItem>
        </Flex>
      </CompassPanel>
    </Panel>
  )
}
