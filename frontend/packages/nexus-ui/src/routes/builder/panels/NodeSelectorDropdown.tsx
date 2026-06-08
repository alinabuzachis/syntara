import { MenuToggle, Select, SelectList, SelectOption, type MenuToggleElement } from '@patternfly/react-core'
import React, { useCallback, useState } from 'react'

import type { UpstreamNodeInfo } from './hooks/useUpstreamNodes'

type NodeSelectorDropdownProps = {
  nodes: UpstreamNodeInfo[]
  selectedNodeId: string
  onSelect: (nodeId: string) => void
}

function getNodeDisplayName(node: UpstreamNodeInfo): string {
  return node.name ?? node.id
}

export function NodeSelectorDropdown({ nodes, selectedNodeId, onSelect }: Readonly<NodeSelectorDropdownProps>) {
  const [isOpen, setIsOpen] = useState(false)

  const selectedNode = nodes.find((node) => node.id === selectedNodeId)
  const toggleText = selectedNode ? getNodeDisplayName(selectedNode) : ''

  const handleSelect = useCallback(
    (_event: React.MouseEvent | undefined, value: string | number | undefined) => {
      if (value === undefined || value === null) return
      onSelect(String(value))
      setIsOpen(false)
    },
    [onSelect]
  )

  return (
    <Select
      isOpen={isOpen}
      selected={selectedNodeId}
      onSelect={handleSelect}
      onOpenChange={setIsOpen}
      toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
        <MenuToggle ref={toggleRef} onClick={() => setIsOpen((prev) => !prev)} isExpanded={isOpen}>
          {toggleText}
        </MenuToggle>
      )}
    >
      <SelectList>
        {nodes.map((node) => (
          <SelectOption key={node.id} value={node.id} isSelected={node.id === selectedNodeId}>
            {getNodeDisplayName(node)}
          </SelectOption>
        ))}
      </SelectList>
    </Select>
  )
}
