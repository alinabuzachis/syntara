import { EdgeHandleEnum } from '@ansible/nexus-contracts'
import { Flex } from '@patternfly/react-core'
import { Handle, Position } from '@xyflow/react'

import { sourceHandleStyle } from './handleStyle'

export function BranchHandles(props: { children: React.ReactNode }) {
  return (
    <Flex direction={{ default: 'column' }} gap={{ default: 'gapSm' }}>
      {props.children}
    </Flex>
  )
}

function getApprovalHandleStyles(id: string): React.CSSProperties | null {
  if (id === EdgeHandleEnum.APPROVED) {
    return {
      backgroundColor: 'var(--pf-t--global--color--status--success--default)',
      color: 'var(--pf-t--global--text--color--status--on-success--default)',
      borderColor: 'var(--pf-t--global--color--status--success--default)',
    }
  }
  if (id === EdgeHandleEnum.REJECTED) {
    return {
      backgroundColor: 'var(--pf-t--global--color--status--danger--default)',
      color: 'var(--pf-t--global--text--color--status--on-danger--default)',
      borderColor: 'var(--pf-t--global--color--status--danger--default)',
    }
  }
  return null
}

export function BranchHandle(props: { children: React.ReactNode; id: string; isConnectable?: boolean }) {
  const approvalStyles = getApprovalHandleStyles(props.id)
  const baseStyles: React.CSSProperties = {
    position: 'relative',
    padding: 'var(--pf-t--global--spacer--xs) var(--pf-t--global--spacer--md)',
    paddingRight: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderTop: '2px solid rgba(255, 255, 255, 0.2)',
    borderBottom: '2px solid rgba(255, 255, 255, 0.2)',
    borderLeft: '2px solid rgba(255, 255, 255, 0.2)',
    borderTopLeftRadius: '2rem',
    borderBottomLeftRadius: '2rem',
    display: 'flex',
    alignItems: 'center',
  }
  return (
    <div
      style={{
        ...baseStyles,
        ...approvalStyles,
      }}
    >
      {/* this is the branch handle text content, like 'true', 'false', 'loop' or 'done', padding to give room for the handle */}
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
