import type { ConditionActivity } from '@ansible/nexus-contracts'
import { Flex, FlexItem } from '@patternfly/react-core'
import { type Node, type NodeProps } from '@xyflow/react'

import { Details } from '../../../../components/details/Details'

import { BranchHandle, BranchHandles } from './common/BranchHandle'
import { renderCondition, renderJson, renderOutputs } from './common/detailRenderers'
import { NodeBody } from './common/NodeBody'
import { NodeComponent } from './common/NodeComponent'
import { StandardNodeHeader } from './common/StandardNodeHeader'
import { MenuNodeType, useNodeMenuActions } from './hooks/useNodeMenuActions'
import { nodeMetadata } from './nodeMetadata'

export type ConditionNode = { type: 'condition' } & Node<ConditionActivity>

export function ConditionNodeComponent(props: NodeProps<ConditionNode>) {
  const metadata = nodeMetadata.condition
  const Icon = metadata.icon!
  const menuActions = useNodeMenuActions({
    nodeId: props.data.id,
    nodeType: MenuNodeType.ACTIVITY,
  })

  return (
    <NodeComponent className={metadata.className} nodeProps={props} disableSource>
      <ConditionNodeDetails
        conditionActivity={props.data}
        icon={
          <div style={{ transform: 'rotate(90deg)', display: 'inline-block' }}>
            <Icon />
          </div>
        }
        menuActions={menuActions}
      >
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
      <Flex
        justifyContent={{ default: 'justifyContentFlexEnd' }}
        gap={{ default: 'gapNone' }}
        style={{ overflowX: 'hidden', overflowY: 'visible' }}
      >
        <FlexItem grow={{ default: 'grow' }} style={{ minWidth: 0 }}>
          <NodeBody>
            <Details>
              {renderCondition(props.conditionActivity.condition)}
              {renderOutputs(props.conditionActivity.outputs)}
              {renderJson(props.conditionActivity, props.showJson, 'Full Definition')}
            </Details>
          </NodeBody>
        </FlexItem>
        {props.children}
      </Flex>
    </>
  )
}
