import type { TaskActivity } from '@ansible/nexus-contracts'
import { Flex, FlexItem } from '@patternfly/react-core'
import { type Node, type NodeProps } from '@xyflow/react'

import { Details } from '../../../../components/details/Details'

import { BranchHandle, BranchHandles } from './common/BranchHandle'
import { renderText } from './common/detailRenderers'
import { NodeBody } from './common/NodeBody'
import { NodeComponent } from './common/NodeComponent'
import { StandardNodeHeader } from './common/StandardNodeHeader'
import { MenuNodeType, useNodeMenuActions } from './hooks/useNodeMenuActions'
import { executorMetadata, nodeMetadata } from './nodeMetadata'

export type ApprovalNode = { type: 'approval' } & Node<TaskActivity>

export function ApprovalNodeComponent(props: NodeProps<ApprovalNode>) {
  const metadata = nodeMetadata.task
  const menuActions = useNodeMenuActions({
    nodeId: props.data.id,
    nodeType: MenuNodeType.ACTIVITY,
  })

  const executorMeta = executorMetadata.approval
  const Icon = executorMeta?.icon
  const taskExecutor = executorMeta?.label || 'Approval'

  return (
    <NodeComponent className={metadata.className} nodeProps={props} disableSource>
      <>
        <StandardNodeHeader
          icon={Icon ? <Icon /> : undefined}
          title={props.data.name ?? 'Untitled Approval'}
          subtitle={taskExecutor}
          expandable
          menuActions={menuActions}
        />
        <Flex justifyContent={{ default: 'justifyContentFlexEnd' }} gap={{ default: 'gapNone' }}>
          <FlexItem grow={{ default: 'grow' }} style={{ minWidth: 0 }}>
            <NodeBody>
              {props.data.approval && (
                <Details>{renderText('Usernames to notify', props.data.approval.approvers.join(', '))}</Details>
              )}
            </NodeBody>
          </FlexItem>
          <div style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
            <BranchHandles>
              <BranchHandle id="approved">Approved</BranchHandle>
              <BranchHandle id="rejected">Rejected</BranchHandle>
            </BranchHandles>
          </div>
        </Flex>
      </>
    </NodeComponent>
  )
}
