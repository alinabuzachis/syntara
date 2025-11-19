import type { Node } from '@xyflow/react'

import type { NodeType } from '../automations/canvas/nodes/NodeType'

interface NodeRawDataViewProps {
  node: Node<NodeType['data']>
}

export function NodeRawDataView({ node }: NodeRawDataViewProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="text-xs font-medium text-gray-300">Node Type</div>
        <div className="rounded-md bg-white/5 px-3 py-1.5 text-xs capitalize">{node.type}</div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-xs font-medium text-gray-300">Node ID</div>
        <div className="rounded-md bg-white/5 px-3 py-1.5 font-mono text-xs">{node.id}</div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-xs font-medium text-gray-300">Node Data</div>
        <pre className="overflow-auto rounded-md bg-white/5 px-3 py-2 font-mono text-xs">
          {JSON.stringify(node.data, null, 2)}
        </pre>
      </div>
    </div>
  )
}
