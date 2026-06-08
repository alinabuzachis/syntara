import { HelperText, HelperTextItem, Label } from '@patternfly/react-core'
import { TreeView, type TreeViewDataItem } from '@patternfly/react-core'
import { useCallback, useMemo } from 'react'

import { buildContextExpression } from '../../../utils/expressions/templateBuilder'

import { CopyExpressionAction, DraggableTreeLeaf } from './components/DraggableTreeLeaf'
import { DRAG_TYPE_CONTEXT, type ContextDragData } from './utils/dragTypes'

type ContextLeafProps = {
  name: string
  value: string
  contextPath: string
}

function ContextLeaf({ name, value, contextPath }: Readonly<ContextLeafProps>) {
  const expression = useMemo(() => buildContextExpression(contextPath), [contextPath])

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      const data: ContextDragData = {
        type: DRAG_TYPE_CONTEXT,
        contextPath,
      }
      e.dataTransfer.setData('application/json', JSON.stringify(data))
      e.dataTransfer.setData('text/plain', expression)
      e.dataTransfer.effectAllowed = 'copy'
    },
    [contextPath, expression]
  )

  return <DraggableTreeLeaf label={`T ${name}`} secondaryText={value} onDragStart={handleDragStart} />
}

export function VariablesAndContextTree() {
  const treeData = useMemo(
    (): TreeViewDataItem[] => [
      {
        id: 'now',
        name: <ContextLeaf name="$now" value="[resolved at execution time]" contextPath="$now" />,
        action: <CopyExpressionAction expressionText={buildContextExpression('$now')} />,
        hasBadge: false,
      },
      {
        id: 'today',
        name: <ContextLeaf name="$today" value="[resolved at execution time]" contextPath="$today" />,
        action: <CopyExpressionAction expressionText={buildContextExpression('$today')} />,
        hasBadge: false,
      },
      {
        id: 'vars',
        name: (
          <Label isCompact color="grey">
            {'{} $vars'}
          </Label>
        ),
        defaultExpanded: true,
        hasBadge: false,
        children: [
          {
            id: 'vars-desc',
            name: (
              <HelperText>
                <HelperTextItem variant="indeterminate">
                  Create variables that can be used across workflows here
                </HelperTextItem>
              </HelperText>
            ),
            hasBadge: false,
          },
        ],
      },
      {
        id: 'execution',
        name: (
          <Label isCompact color="grey">
            {'{} $execution'}
          </Label>
        ),
        defaultExpanded: true,
        hasBadge: false,
        children: [
          {
            id: 'execution-id',
            name: <ContextLeaf name="id" value="[filled at time of execution]" contextPath="$execution.id" />,
            action: <CopyExpressionAction expressionText={buildContextExpression('$execution.id')} />,
            hasBadge: false,
          },
          {
            id: 'execution-mode',
            name: <ContextLeaf name="mode" value="manual" contextPath="$execution.mode" />,
            action: <CopyExpressionAction expressionText={buildContextExpression('$execution.mode')} />,
            hasBadge: false,
          },
          {
            id: 'execution-resumeUrl',
            name: (
              <ContextLeaf
                name="resumeUrl"
                value="The URL for resuming a Wait node"
                contextPath="$execution.resumeUrl"
              />
            ),
            action: <CopyExpressionAction expressionText={buildContextExpression('$execution.resumeUrl')} />,
            hasBadge: false,
          },
        ],
      },
      {
        id: 'workflow',
        name: (
          <Label isCompact color="grey">
            {'{} $workflow'}
          </Label>
        ),
        defaultExpanded: true,
        hasBadge: false,
        children: [
          {
            id: 'workflow-desc',
            name: (
              <HelperText>
                <HelperTextItem variant="indeterminate">Workflow information</HelperTextItem>
              </HelperText>
            ),
            hasBadge: false,
          },
        ],
      },
    ],
    []
  )

  return <TreeView data={treeData} aria-label="Variables and context" />
}
