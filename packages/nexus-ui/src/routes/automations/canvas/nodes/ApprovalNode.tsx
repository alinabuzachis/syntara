import type { TaskActivity } from '@ansible/nexus-contracts'
import { Flex, FlexItem } from '@patternfly/react-core'
import { type Node, type NodeProps } from '@xyflow/react'

import { Details } from '../../../../components/details/Details'
import type { ActivityStatus } from '../../execution/types'
import { getNodeTypeColor } from '../nodeTypeColors'
import { semanticZoomActivityTitle } from '../semanticZoom'

import { BranchHandle, BranchHandles } from './common/BranchHandle'
import { renderText } from './common/detailRenderers'
import { NodeBody } from './common/NodeBody'
import { NodeComponent } from './common/NodeComponent'
import { StandardNodeHeader } from './common/StandardNodeHeader'
import { MenuNodeType, useNodeMenuActions } from './hooks/useNodeMenuActions'
import { executorMetadata, nodeMetadata } from './nodeMetadata'
import { renderNodeIcon } from './renderNodeIcon'

export type ApprovalNode = { type: 'approval' } & Node<TaskActivity>

export function ApprovalNodeComponent(props: NodeProps<ApprovalNode>) {
  const metadata = nodeMetadata.task
  const menuActions = useNodeMenuActions({
    nodeId: props.data.id,
    nodeType: MenuNodeType.ACTIVITY,
  })

  const executorMeta = executorMetadata.approval
  const iconNode = renderNodeIcon(executorMeta?.icon, 'approval', 'canvas', getNodeTypeColor('approval'))
  const taskExecutor = executorMeta?.label || 'Approval'

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

  const showExecutionBadge =
    ((props.data as Record<string, unknown>).metadata as { __showExecutionBadge?: boolean } | undefined)
      ?.__showExecutionBadge === true

  return (
    <NodeComponent
      className={metadata.className}
      nodeProps={props}
      disableSource
      executionState={executionState}
      showExecutionBadge={showExecutionBadge}
      topBarColor={getNodeTypeColor('approval')}
      semanticZoomSummary={{
        title: semanticZoomActivityTitle(props.data.name, `Untitled ${taskExecutor}`),
        typeLabel: taskExecutor,
      }}
      semanticZoomBranchSources={[
        { id: 'approved', ariaLabel: 'Approved branch output' },
        { id: 'rejected', ariaLabel: 'Rejected branch output' },
      ]}
    >
      <>
        <StandardNodeHeader
          icon={iconNode}
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
