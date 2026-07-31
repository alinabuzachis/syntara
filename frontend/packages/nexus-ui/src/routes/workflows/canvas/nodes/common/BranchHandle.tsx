import { Flex } from '@patternfly/react-core'
import { RhUiCheckIcon } from '@patternfly/react-icons'
import { Handle, Position, useEdges } from '@xyflow/react'
import { useMemo } from 'react'

import { getApprovalBranchHandleStyles } from './approvalBranchTokens'
import styles from './BranchHandle.module.css'
import { sourceHandleStyle } from './handleStyle'

function useIsBranchTaken(nodeId: string | undefined, handleId: string): boolean {
  const edges = useEdges()
  return useMemo(() => {
    if (!nodeId) return false
    return edges.some((e) => e.source === nodeId && e.sourceHandle === handleId && e.data?.executionStatus === 'passed')
  }, [edges, nodeId, handleId])
}

function getHandleAriaLabel(ariaLabel: string | undefined, isTaken: boolean): string | undefined {
  if (!ariaLabel) return undefined
  return isTaken ? `${ariaLabel} — path taken` : ariaLabel
}

export function BranchHandles(props: Readonly<{ children: React.ReactNode }>) {
  return (
    <Flex data-testid="branch-handles" direction={{ default: 'column' }} gap={{ default: 'gapSm' }}>
      {props.children}
    </Flex>
  )
}

export function BranchHandle(
  props: Readonly<{
    children: React.ReactNode
    id: string
    isConnectable?: boolean
    nodeId?: string
    ariaLabel?: string
    badge?: React.ReactNode
  }>
) {
  const approvalStyles = getApprovalBranchHandleStyles(props.id)
  const isTaken = useIsBranchTaken(props.nodeId, props.id)

  const inlineStyles = approvalStyles ? { ...approvalStyles } : undefined

  return (
    <div
      data-testid={`branch-handle-${props.id}`}
      className={`${styles.branchHandle} ${isTaken ? styles.branchHandleTaken : ''}`}
      style={inlineStyles}
    >
      <div className={styles.branchHandleContent}>
        {props.children}
        {props.badge}
        {isTaken && (
          <RhUiCheckIcon
            aria-hidden="true"
            className={styles.takenIcon}
            style={approvalStyles ? { color: approvalStyles.color } : undefined}
          />
        )}
      </div>
      <Handle
        type="source"
        id={props.id}
        position={Position.Right}
        isConnectable={props.isConnectable}
        aria-label={getHandleAriaLabel(props.ariaLabel, isTaken)}
        style={{
          ...sourceHandleStyle,
          pointerEvents: 'auto',
          ...(isTaken && {
            backgroundColor: approvalStyles?.borderColor ?? 'var(--pf-t--global--color--status--success--default)',
            borderColor: approvalStyles?.borderColor ?? 'var(--pf-t--global--color--status--success--default)',
          }),
        }}
      />
    </div>
  )
}
