import type { ConditionActivity } from '@ansible/nexus-contracts'
import { Flex, FlexItem } from '@patternfly/react-core'
import { type Node, type NodeProps } from '@xyflow/react'

import { Details } from '../../../../components/details/Details'
import type { ActivityStatus } from '../../execution/types'

import { BranchHandle, BranchHandles } from './common/BranchHandle'
import { renderJson, renderOutputs } from './common/detailRenderers'
import { NodeBody } from './common/NodeBody'
import { NodeComponent } from './common/NodeComponent'
import { StandardNodeHeader } from './common/StandardNodeHeader'
import { MenuNodeType, useNodeMenuActions } from './hooks/useNodeMenuActions'
import { nodeMetadata } from './nodeMetadata'
import { renderNodeIcon } from './renderNodeIcon'

export type ConditionNode = { type: 'condition' } & Node<ConditionActivity>

export function ConditionNodeComponent(props: NodeProps<ConditionNode>) {
  const metadata = nodeMetadata.condition
  const iconNode = renderNodeIcon(metadata.icon, 'logic-condition')
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
    <NodeComponent className={metadata.className} nodeProps={props} disableSource executionState={executionState}>
      <ConditionNodeDetails conditionActivity={props.data} icon={iconNode} menuActions={menuActions}>
        <BranchHandles>
          <BranchHandle id="true">True</BranchHandle>
          <BranchHandle id="false">False</BranchHandle>
        </BranchHandles>
      </ConditionNodeDetails>
    </NodeComponent>
  )
}

export function ConditionNodeDetails(props: {
  conditionActivity: ConditionActivity
  children?: React.ReactNode
  showJson?: boolean
  icon?: React.ReactNode
  menuActions?: ReturnType<typeof useNodeMenuActions>
}) {
  const metadata = nodeMetadata.condition

  return (
    <>
      <StandardNodeHeader
        icon={props.icon}
        title={props.conditionActivity.name ?? 'Untitled Condition'}
        subtitle={metadata.label}
        expandable
        menuActions={props.menuActions}
      />
      <Flex justifyContent={{ default: 'justifyContentFlexEnd' }} gap={{ default: 'gapNone' }}>
        <FlexItem grow={{ default: 'grow' }} style={{ minWidth: 0 }}>
          <NodeBody>
            <Details>
              {renderOutputs(props.conditionActivity.outputs)}
              {renderJson(props.conditionActivity, props.showJson, 'Full Definition')}
            </Details>
          </NodeBody>
        </FlexItem>
        <div style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>{props.children}</div>
      </Flex>
    </>
  )
}
