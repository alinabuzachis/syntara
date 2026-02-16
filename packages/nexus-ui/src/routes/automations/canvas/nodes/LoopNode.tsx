import type { LoopActivity } from '@ansible/nexus-contracts'
import { Flex } from '@patternfly/react-core'
import { type Node, type NodeProps } from '@xyflow/react'

import { BranchHandle, BranchHandles } from './common/BranchHandle'
import { NodeComponent } from './common/NodeComponent'
import { StandardNodeHeader } from './common/StandardNodeHeader'
import { MenuNodeType, useNodeMenuActions } from './hooks/useNodeMenuActions'
import { nodeMetadata } from './nodeMetadata'
import { renderNodeIcon } from './renderNodeIcon'

export type LoopNode = { type: 'loop' } & Node<LoopActivity>

export function LoopNodeComponent(props: NodeProps<LoopNode>) {
  const metadata = nodeMetadata.loop
  const iconNode = renderNodeIcon(metadata.icon, 'logic-loop')
  const menuActions = useNodeMenuActions({
    nodeId: props.data.id,
    nodeType: MenuNodeType.ACTIVITY,
  })

  // Extract execution state if present
  const executionState = (props.data as Record<string, unknown>).__executionState as
    | {
        status: string
        started_at?: string
        completed_at?: string
        error_details?: string
        retry_count?: number
      }
    | undefined

  return (
    <NodeComponent
      className={metadata.className}
      disableSource // Disable default source handle since we use BranchHandles instead
      enableEnd={metadata.enableEnd}
      enableStart={metadata.enableStart}
      nodeProps={props}
      executionState={executionState}
    >
      <StandardNodeHeader
        icon={iconNode}
        title={props.data.name ?? ''}
        subtitle={metadata.label}
        menuActions={menuActions}
      />
      <Flex
        justifyContent={{ default: 'justifyContentFlexEnd' }}
        style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}
      >
        <BranchHandles>
          <BranchHandle id="done">Done</BranchHandle>
          <BranchHandle id="loop">Loop</BranchHandle>
        </BranchHandles>
      </Flex>
    </NodeComponent>
  )
}
