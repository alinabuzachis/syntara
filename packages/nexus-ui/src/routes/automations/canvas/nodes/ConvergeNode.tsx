import type { ConvergeActivity } from '@ansible/nexus-contracts'
import { Flex } from '@patternfly/react-core'
import { type Node, type NodeProps } from '@xyflow/react'

import { Detail } from '../../../../components/details/Detail'
import { Details } from '../../../../components/details/Details'

import { NodeBody } from './common/NodeBody'
import { NodeComponent } from './common/NodeComponent'
import { StandardNodeHeader } from './common/StandardNodeHeader'
import { nodeMetadata } from './nodeMetadata'

export type ConvergeNode = { type: 'converge' } & Node<ConvergeActivity>

/**
 * Format seconds as human-readable duration
 */
function formatTimeout(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

export function ConvergeNodeComponent(props: NodeProps<ConvergeNode>) {
  const metadata = nodeMetadata.converge
  const Icon = metadata.icon!
  const timeout = props.data.converge?.timeout
  const onTimeout = props.data.converge?.onTimeout ?? 'fail'
  const aggregateOutputs = props.data.converge?.aggregateOutputs ?? true

  return (
    <NodeComponent className={metadata.className} nodeProps={props}>
      <StandardNodeHeader
        icon={
          <div style={{ transform: 'rotate(90deg)', display: 'inline-block' }}>
            <Icon />
          </div>
        }
        title={props.data.name}
        subtitle={metadata.label}
        expandable
      />
      <Flex justifyContent={{ default: 'justifyContentFlexStart' }} style={{ overflow: 'hidden' }}>
        <NodeBody>
          <Details>
            <Detail label="Strategy">all</Detail>
            {timeout && <Detail label="Timeout">{formatTimeout(timeout)}</Detail>}
            <Detail label="On timeout">{onTimeout}</Detail>
            <Detail label="Aggregate outputs">{aggregateOutputs ? 'Yes' : 'No'}</Detail>
          </Details>
        </NodeBody>
      </Flex>
    </NodeComponent>
  )
}
