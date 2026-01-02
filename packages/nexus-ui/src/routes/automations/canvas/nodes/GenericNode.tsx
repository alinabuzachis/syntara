import type { TaskActivity } from '@ansible/nexus-contracts'
import { Content, ContentVariants, Flex, FlexItem } from '@patternfly/react-core'
import { RhUiSettingsIcon } from '@patternfly/react-icons'
import { type Node, type NodeProps } from '@xyflow/react'

import { NodeBody } from './common/NodeBody'
import { NodeComponent } from './common/NodeComponent'
import { StandardNodeHeader } from './common/StandardNodeHeader'

export type GenericNode = { type: 'generic' } & Node<TaskActivity>

/**
 * Generic placeholder node component
 * Renders a dashed border node with a plus icon
 * When clicked, allows user to select what type of node to convert it to
 */
export function GenericNodeComponent(props: NodeProps<GenericNode>) {
  // Check for custom message in metadata
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customMessage = (props.data as any).metadata?.__customMessage as string | undefined
  const displayMessage = customMessage || 'Select a node type'

  // Only show title if no custom message (custom message replaces title)
  const showTitle = !customMessage

  // Check if this generic node should have reversed handles (for loop-back paths)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reverseHandles = (props.data as any).metadata?.__reverseHandles as boolean | undefined

  return (
    <NodeComponent nodeProps={props} reverseHandles={reverseHandles} hasDashedBorder>
      <StandardNodeHeader
        icon={<RhUiSettingsIcon />}
        title={showTitle ? 'Click to configure' : undefined}
        expandable={false}
      />
      <NodeBody>
        <Flex alignItems={{ default: 'alignItemsCenter' }} justifyContent={{ default: 'justifyContentCenter' }}>
          <FlexItem>
            <Content component={ContentVariants.h4}>{displayMessage}</Content>
          </FlexItem>
        </Flex>
      </NodeBody>
    </NodeComponent>
  )
}
