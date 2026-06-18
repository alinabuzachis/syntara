import { Flex } from '@patternfly/react-core'
import { Handle, Position } from '@xyflow/react'
import type { CSSProperties } from 'react'

import { getApprovalBranchHandleStyles } from './approvalBranchTokens'
import { sourceHandleStyle } from './handleStyle'

export function BranchHandles(props: Readonly<{ children: React.ReactNode }>) {
  return (
    <Flex data-testid="branch-handles" direction={{ default: 'column' }} gap={{ default: 'gapSm' }}>
      {props.children}
    </Flex>
  )
}

export function BranchHandle(props: Readonly<{ children: React.ReactNode; id: string; isConnectable?: boolean }>) {
  const approvalStyles = getApprovalBranchHandleStyles(props.id)
  const baseStyles: CSSProperties = {
    position: 'relative',
    padding: 'var(--pf-t--global--spacer--xs) var(--pf-t--global--spacer--md)',
    paddingRight: 0,
    backgroundColor: 'var(--pf-t--global--background--color--secondary--default)',
    borderTop: '2px solid var(--pf-t--global--border--color--default)',
    borderBottom: '2px solid var(--pf-t--global--border--color--default)',
    borderLeft: '2px solid var(--pf-t--global--border--color--default)',
    borderTopLeftRadius: '2rem',
    borderBottomLeftRadius: '2rem',
    display: 'flex',
    alignItems: 'center',
  }
  return (
    <div
      data-testid={`branch-handle-${props.id}`}
      style={{
        ...baseStyles,
        ...approvalStyles,
      }}
    >
      <div style={{ paddingRight: 'var(--pf-t--global--spacer--md)' }}>{props.children}</div>
      <Handle
        type="source"
        id={props.id}
        position={Position.Right}
        isConnectable={props.isConnectable}
        style={{
          ...sourceHandleStyle,
          pointerEvents: 'auto',
        }}
      />
    </div>
  )
}
