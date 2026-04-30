import { Label, TreeView, type TreeViewDataItem } from '@patternfly/react-core'
import { useCallback, useMemo } from 'react'

import { buildExpression } from '../../../../utils/expressions/templateBuilder'
import { highlightText } from '../../../../utils/highlightText'
import { CopyExpressionAction, DraggableTreeLeaf } from '../components/DraggableTreeLeaf'
import { DRAG_TYPE_FIELD, type FieldDragData } from '../utils/dragTypes'
import { formatLeafValue, isExpandable } from '../utils/treeHelpers'
import { getTypeLabelFromValue } from '../utils/typeLabels'

export type InputSchemaViewProps = {
  data: Record<string, unknown> | null
  nodeId: string
  searchTerm?: string
}

function buildTreeData(
  data: Record<string, unknown>,
  nodeId: string,
  parentPath: string[] = [],
  searchTerm?: string
): TreeViewDataItem[] {
  return Object.entries(data).map(([key, value]) => {
    const currentPath = [...parentPath, key]
    const typeLabel = getTypeLabelFromValue(value)

    if (isExpandable(value)) {
      return {
        id: currentPath.join('.'),
        name: (
          <Label isCompact color="grey">
            {typeLabel} {searchTerm ? highlightText(key, searchTerm) : key}
          </Label>
        ),
        defaultExpanded: true,
        hasBadge: false,
        children: buildTreeData(value, nodeId, currentPath, searchTerm),
      }
    }

    const pathKey = currentPath.join('.')
    const expression = buildExpression({ nodeId, fieldPath: currentPath })
    return {
      id: pathKey,
      name: (
        <LeafNode
          fieldKey={key}
          value={value}
          typeLabel={typeLabel}
          nodeId={nodeId}
          pathKey={pathKey}
          searchTerm={searchTerm}
        />
      ),
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
  searchTerm?: string
}

function LeafNode({ fieldKey, value, typeLabel, nodeId, pathKey, searchTerm }: Readonly<LeafNodeProps>) {
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

  const label = `${typeLabel} ${fieldKey}`
  const secondary = formatLeafValue(value)

  return (
    <DraggableTreeLeaf
      label={searchTerm ? highlightText(label, searchTerm) : label}
      secondaryText={searchTerm ? highlightText(secondary, searchTerm) : secondary}
      onDragStart={handleDragStart}
    />
  )
}

export function InputSchemaView({ data, nodeId, searchTerm }: Readonly<InputSchemaViewProps>) {
  const treeData = useMemo(() => {
    if (!data) return []
    return buildTreeData(data, nodeId, [], searchTerm)
  }, [data, nodeId, searchTerm])

  if (!data || treeData.length === 0) {
    return null
  }

  return <TreeView data={treeData} aria-label="Input schema" />
}
