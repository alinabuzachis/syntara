import { Handle, Position } from '@xyflow/react'

import { handleStyle } from './handleStyle'

export function BranchHandles(props: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2 self-end pb-2">{props.children}</div>
}

export function BranchHandle(props: { children: React.ReactNode; id: string; isConnectable?: boolean }) {
  return (
    <div className="group/handle relative rounded-l-4xl border-y-2 border-l-2 border-white/20 bg-white/10 px-3 py-1 hover:border-white/40 hover:bg-white/20">
      {props.children}
      <Handle
        type="source"
        id={props.id}
        position={Position.Right}
        isConnectable={props.isConnectable}
        style={{
          ...handleStyle,
          // Cover the entire label area to ensure ReactFlow detects the correct handle
          width: '100%',
          height: '100%',
          top: 15,
          right: 0,
          borderRadius: '0',
          opacity: 1,
        }}
      />
      {/* Visual indicator half-circle - only visible when parent has handle-{id}-connected class */}
      <div
        className={`handle-${props.id}-indicator pointer-events-none absolute top-1/2 right-0 -translate-y-1/2 opacity-0`}
        style={{
          width: '8px',
          height: '16px',
          borderRadius: '8px 0 0 8px',
          border: '2px solid #6b7280',
          borderRight: 'none',
          background: 'white',
        }}
      />
    </div>
  )
}
