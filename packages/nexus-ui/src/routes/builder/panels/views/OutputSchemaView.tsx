import { Label, TreeView, type TreeViewDataItem } from '@patternfly/react-core'
import { useMemo } from 'react'

import styles from '../panels.module.css'
import { formatLeafValue, isExpandable } from '../utils/treeHelpers'
import { getTypeLabelFromValue } from '../utils/typeLabels'

export type OutputSchemaViewProps = {
  data: Record<string, unknown> | null
}

function buildReadOnlyTreeData(data: Record<string, unknown>, parentPath: string[] = []): TreeViewDataItem[] {
  return Object.entries(data).map(([key, value]) => {
    const currentPath = [...parentPath, key]
    const typeLabel = getTypeLabelFromValue(value)

    if (isExpandable(value)) {
      return {
        id: JSON.stringify(currentPath),
        name: (
          <Label isCompact color="grey">
            {typeLabel} {key}
          </Label>
        ),
        defaultExpanded: true,
        children: buildReadOnlyTreeData(value, currentPath),
      }
    }

    return {
      id: JSON.stringify(currentPath),
      name: (
        // eslint-disable-next-line nexus/prefer-pf-text-components -- span provides aria-label for tree node accessibility; PF6 has no inline text component
        <span aria-label={`${key}: ${formatLeafValue(value)}, type ${typeLabel}`}>
          <Label isCompact color="grey">
            {typeLabel}
          </Label>{' '}
          {key}: <span className={styles.leafValue}>{formatLeafValue(value)}</span>
        </span>
      ),
    }
  })
}

export function OutputSchemaView({ data }: Readonly<OutputSchemaViewProps>) {
  const treeData = useMemo(() => {
    if (!data) return []
    return buildReadOnlyTreeData(data)
  }, [data])

  if (!data) {
    return null
  }

  return <TreeView data={treeData} aria-label="Output schema" />
}
