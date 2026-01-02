import { Flex } from '@patternfly/react-core'
import { Handle, Position } from '@xyflow/react'

export function BranchHandles(props: { children: React.ReactNode }) {
  return (
    <Flex direction={{ default: 'column' }} gap={{ default: 'gapSm' }}>
      {props.children}
    </Flex>
  )
}

export function BranchHandle(props: { children: React.ReactNode; id: string; isConnectable?: boolean }) {
  return (
    <div
      style={{
        position: 'relative',
        padding: 'var(--pf-t--global--spacer--xs) var(--pf-t--global--spacer--md)',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderTop: '2px solid rgba(255, 255, 255, 0.2)',
        borderBottom: '2px solid rgba(255, 255, 255, 0.2)',
        borderLeft: '2px solid rgba(255, 255, 255, 0.2)',
        borderTopLeftRadius: '2rem',
        borderBottomLeftRadius: '2rem',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div style={{ paddingRight: 'var(--pf-t--global--spacer--md)' }}>{props.children}</div>
      <Handle
        type="source"
        id={props.id}
        position={Position.Right}
        isConnectable={props.isConnectable}
        style={{
          position: 'absolute',
          top: '50%',
          right: -6,
          transform: 'translateY(-50%)',
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.9)',
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.3)',
          borderStyle: 'solid',
          cursor: 'crosshair',
          pointerEvents: 'auto',
        }}
      />
    </div>
  )
}
