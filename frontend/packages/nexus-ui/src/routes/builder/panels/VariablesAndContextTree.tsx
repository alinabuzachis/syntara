import { HelperText, HelperTextItem, Label } from '@patternfly/react-core'
import { TreeView, type TreeViewDataItem } from '@patternfly/react-core'
import { useCallback, useMemo } from 'react'

import { buildContextExpression } from '../../../utils/expressions/templateBuilder'
import type { WorkflowMetadata } from '../types/workflowMetadata'

import { CopyExpressionAction, DraggableTreeLeaf } from './components/DraggableTreeLeaf'
import { DRAG_TYPE_CONTEXT, type ContextDragData } from './utils/dragTypes'

export type { WorkflowMetadata } from '../types/workflowMetadata'

type VariablesAndContextTreeProps = {
  workflowMetadata?: WorkflowMetadata
}

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

function makeRuntimeField(id: string, fieldName: string, contextPath: string): TreeViewDataItem {
  return {
    id,
    name: <ContextLeaf name={fieldName} value="[resolved at execution time]" contextPath={contextPath} />,
    action: <CopyExpressionAction expressionText={buildContextExpression(contextPath)} />,
    hasBadge: false,
  }
}

function makeWorkflowField(fieldName: string, value: string): TreeViewDataItem {
  const contextPath = `workflow_context.workflow.${fieldName}`
  return {
    id: `wf-${fieldName}`,
    name: <ContextLeaf name={fieldName} value={value} contextPath={contextPath} />,
    action: <CopyExpressionAction expressionText={buildContextExpression(contextPath)} />,
    hasBadge: false,
  }
}

export function VariablesAndContextTree({ workflowMetadata }: Readonly<VariablesAndContextTreeProps>) {
  const noWf = '[no workflow loaded]'

  const treeData = useMemo(
    (): TreeViewDataItem[] => [
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
        id: 'workflow-context',
        name: (
          <Label isCompact color="grey">
            {'{} workflow_context'}
          </Label>
        ),
        defaultExpanded: true,
        hasBadge: false,
        children: [
          makeRuntimeField('wc-now', 'now', 'workflow_context.now'),
          makeRuntimeField('wc-today', 'today', 'workflow_context.today'),
          {
            id: 'wc-workflow',
            name: (
              <Label isCompact color="grey">
                {'{} workflow'}
              </Label>
            ),
            defaultExpanded: true,
            hasBadge: false,
            children: [
              makeWorkflowField('name', workflowMetadata?.name ?? noWf),
              makeWorkflowField('id', workflowMetadata?.id ?? noWf),
              makeWorkflowField('version', workflowMetadata ? String(workflowMetadata.version) : noWf),
              makeWorkflowField('published', workflowMetadata ? String(workflowMetadata.published) : noWf),
              makeWorkflowField('author', workflowMetadata?.author ?? noWf),
            ],
          },
          {
            id: 'wc-execution',
            name: (
              <Label isCompact color="grey">
                {'{} execution'}
              </Label>
            ),
            defaultExpanded: true,
            hasBadge: false,
            children: [
              makeRuntimeField('wc-exec-id', 'id', 'workflow_context.execution.id'),
              makeRuntimeField('wc-exec-mode', 'mode', 'workflow_context.execution.mode'),
              makeRuntimeField('wc-exec-created-by', 'created_by', 'workflow_context.execution.created_by'),
              makeRuntimeField('wc-exec-created-at', 'created_at', 'workflow_context.execution.created_at'),
              makeRuntimeField(
                'wc-exec-version-id',
                'workflow_version_id',
                'workflow_context.execution.workflow_version_id'
              ),
            ],
          },
        ],
      },
    ],
    [workflowMetadata]
  )

  return <TreeView data={treeData} aria-label="Variables and context" />
}
