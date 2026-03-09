import type { ParallelActivity } from '@ansible/nexus-contracts'
import { type Node, type NodeProps } from '@xyflow/react'

import type { ActivityStatus } from '../../execution/types'

import { NodeComponent } from './common/NodeComponent'
import { StandardNodeHeader } from './common/StandardNodeHeader'
import { MenuNodeType, useNodeMenuActions } from './hooks/useNodeMenuActions'
import { nodeMetadata } from './nodeMetadata'

export type ParallelNode = { type: 'parallel' } & Node<ParallelActivity>

export function ParallelNodeComponent(props: NodeProps<ParallelNode>) {
  const metadata = nodeMetadata.parallel
  const menuActions = useNodeMenuActions({
    nodeId: props.data.id,
    nodeType: MenuNodeType.ACTIVITY,
  })

  // Extract execution state if present
  const executionState = (props.data as Record<string, unknown>).__executionState as
    | {
        status: ActivityStatus
        started_at?: string
        completed_at?: string
        error_details?: string
        retry_count?: number
      }
    | undefined

  return (
    <NodeComponent className={metadata.className} nodeProps={props} executionState={executionState}>
      <StandardNodeHeader title={props.data.name} subtitle={metadata.label} menuActions={menuActions} />
    </NodeComponent>
  )
}
