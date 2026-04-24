import { Label } from '@patternfly/react-core'
import { TreeView, type TreeViewDataItem } from '@patternfly/react-core'
import { useCallback, useMemo } from 'react'

import { buildExpression } from '../../../../utils/expressions/templateBuilder'
import { CopyExpressionAction, DraggableTreeLeaf } from '../components/DraggableTreeLeaf'
import { DRAG_TYPE_FIELD, type FieldDragData } from '../utils/dragTypes'
import { getTypeLabelFromValue } from '../utils/typeLabels'

export type InputSchemaViewProps = {
  data: Record<string, unknown> | null
  nodeId: string
}

function isExpandable(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatLeafValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return JSON.stringify(value)
  return String(value)
}

function buildTreeData(data: Record<string, unknown>, nodeId: string, parentPath: string[] = []): TreeViewDataItem[] {
  return Object.entries(data).map(([key, value]) => {
    const currentPath = [...parentPath, key]
    const typeLabel = getTypeLabelFromValue(value)

    if (isExpandable(value)) {
      return {
        id: currentPath.join('.'),
        name: (
          <Label isCompact color="grey">
            {typeLabel} {key}
          </Label>
        ),
        defaultExpanded: true,
        hasBadge: false,
        children: buildTreeData(value, nodeId, currentPath),
      }
    }

    const pathKey = currentPath.join('.')
    const expression = buildExpression({ nodeId, fieldPath: currentPath })
    return {
      id: pathKey,
      name: <LeafNode fieldKey={key} value={value} typeLabel={typeLabel} nodeId={nodeId} pathKey={pathKey} />,
      action: <CopyExpressionAction expressionText={expression} />,
      hasBadge: false,
    }
  })
}

type LeafNodeProps = {
  fieldKey: string
  value: unknown
  typeLabel: string
  nodeId: string
  pathKey: string
}

function LeafNode({ fieldKey, value, typeLabel, nodeId, pathKey }: Readonly<LeafNodeProps>) {
  const fieldPath = useMemo(() => pathKey.split('.'), [pathKey])
  const expression = useMemo(() => buildExpression({ nodeId, fieldPath }), [nodeId, fieldPath])

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      const data: FieldDragData = {
        type: DRAG_TYPE_FIELD,
        nodeId,
        fieldPath,
      }
      e.dataTransfer.setData('application/json', JSON.stringify(data))
      e.dataTransfer.setData('text/plain', expression)
      e.dataTransfer.effectAllowed = 'copy'
    },
    [nodeId, fieldPath, expression]
  )

  return (
    <DraggableTreeLeaf
      label={`${typeLabel} ${fieldKey}`}
      secondaryText={formatLeafValue(value)}
      onDragStart={handleDragStart}
    />
  )
}

export function InputSchemaView({ data, nodeId }: Readonly<InputSchemaViewProps>) {
  const treeData = useMemo(() => {
    if (!data) return []
    return buildTreeData(data, nodeId)
  }, [data, nodeId])

  if (!data) {
    return null
  }

  return <TreeView data={treeData} aria-label="Input schema" />
}
