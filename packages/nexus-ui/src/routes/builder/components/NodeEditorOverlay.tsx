import { Flex, FlexItem } from '@patternfly/react-core'
import type { Node } from '@xyflow/react'
import { memo } from 'react'

import type { NodeType } from '../../automations/canvas/nodes/NodeType'
import { NodeDetailsPanel } from '../NodeDetailsPanel'

interface NodeEditorOverlayProps {
  isOpen: boolean
  mode: 'add' | 'edit' | null
  selectedNode: Node<NodeType['data']> | null
  nodeTypeId: string | null
  nodeSubtypeId: string | null
  sourceNodeId: string | null
  replacementNodeId: string | null
  onConnect: (sourceId: string, targetId: string) => void
  onClose: () => void
}

export const NodeEditorOverlay = memo(function NodeEditorOverlay(props: NodeEditorOverlayProps) {
  const { isOpen, mode, selectedNode, nodeTypeId, nodeSubtypeId, sourceNodeId, replacementNodeId, onConnect, onClose } =
    props

  if (!isOpen) return null

  return (
    <Flex
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 2,
      }}
    >
      <FlexItem grow={{ default: 'grow' }} style={{ minWidth: 0, height: '100%' }}>
        <NodeDetailsPanel
          mode={mode === 'edit' ? 'edit' : 'add'}
          node={mode === 'edit' ? (selectedNode ?? undefined) : undefined}
          nodeTypeId={mode === 'add' ? nodeTypeId : null}
          nodeSubtypeId={mode === 'add' ? nodeSubtypeId : null}
          sourceNodeId={sourceNodeId}
          replacementNodeId={replacementNodeId}
          onConnect={onConnect}
          onClose={onClose}
        />
      </FlexItem>
    </Flex>
  )
})
