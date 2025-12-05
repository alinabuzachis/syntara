import type { TaskActivity } from '@ansible/nexus-contracts'
import { type Node, type NodeProps } from '@xyflow/react'
import { PlusCircleIcon } from 'lucide-react'

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
    <NodeComponent
      className="w-node cursor-pointer rounded-2xl border-2 border-dashed border-gray-400 bg-gray-50 hover:border-blue-500 hover:bg-blue-50"
      nodeProps={props}
      reverseHandles={reverseHandles}
    >
      <StandardNodeHeader
        icon={<PlusCircleIcon className="size-6 text-gray-500" />}
        title={showTitle ? 'Click to configure' : undefined}
        expandable={false}
      />
      <NodeBody>
        <div className="flex items-center justify-center py-4">
          <p className="text-xs text-gray-500">{displayMessage}</p>
        </div>
      </NodeBody>
    </NodeComponent>
  )
}
