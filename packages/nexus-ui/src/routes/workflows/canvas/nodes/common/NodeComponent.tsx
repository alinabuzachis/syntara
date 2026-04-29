import { ExecutorTypeEnum, type TaskActivity } from '@ansible/nexus-contracts'
import { Handle, type NodeProps, Position } from '@xyflow/react'
import React, { useEffect, useMemo, useState } from 'react'

import { AppPanel } from '../../../../../components/AppPanel'
import { FlowNodeType } from '../../../../../constants'
import { ExecutionStatusBadge } from '../../../../builder/components/ExecutionStatusBadge'
import type { ActivityStatus } from '../../../execution/types'
import { NODE_TYPE_COLORS } from '../../nodeTypeColors'
import type { SemanticZoomBranchSource } from '../../semanticZoomTypes'
import { useSemanticZoom } from '../hooks/useSemanticZoom'

import { targetHandleStyle, sourceHandleStyle } from './handleStyle'
import { NodeExpandedAllContext } from './NodeExpandedAllContext'
import { NodeExpandedContext } from './NodeExpandedContext'
import { NodeSemanticZoomBody } from './NodeSemanticZoomBody'

type ExecutionState = {
  status: ActivityStatus
  started_at?: string
  completed_at?: string
  error_details?: string
  retry_count?: number
}

const DEFAULT_NODE_WIDTH = 240
const WIDE_NODE_WIDTH = 360

/** `variant="raised"` maps to PF small radius; override so canvas nodes match default card rounding (and `::before`). */
const WORKFLOW_NODE_PANEL_RADIUS_STYLE = {
  '--pf-v6-c-panel--BorderRadius': 'var(--pf-t--global--border--radius--medium)',
} as React.CSSProperties

const isWideTaskNode = (nodeProps: NodeProps) => {
  if (nodeProps.type === FlowNodeType.GENERIC) {
    return true
  }

  if (nodeProps.type !== FlowNodeType.TASK && nodeProps.type !== FlowNodeType.TASK_REVERSED) {
    return false
  }

  const data = nodeProps.data as TaskActivity | undefined
  if (!data) {
    return false
  }

  // In v2, activity.type IS the executor directly (no task.executor wrapper)
  if (data.type === ExecutorTypeEnum.AGENTIC) {
    return true
  }

  return false
}

// eslint-disable-next-line complexity
export function NodeComponent(props: {
  children: React.ReactNode
  disableSource?: boolean
  disableTarget?: boolean
  enableStart?: boolean
  enableEnd?: boolean
  reverseHandles?: boolean
  className?: string
  style?: React.CSSProperties
  hasDashedBorder?: boolean
  onClick?: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void
  nodeProps: NodeProps
  collapsible?: boolean
  executionState?: ExecutionState
  showExecutionBadge?: boolean
  /** Optional color for the type indicator bar at the top of the node (PatternFly token or CSS color) */
  topBarColor?: string
  /** When zoomed out, used for tooltip text on the compact color block */
  semanticZoomSummary?: { title: string; typeLabel: string }
  /** Branch source handles at semantic zoom (no labels; stacked on the bar edge) */
  semanticZoomBranchSources?: readonly SemanticZoomBranchSource[]
  /** Optional stable hook for tests (e.g. canvas node root) */
  rootTestId?: string
}) {
  const { expandAllEvent, collapseAllEvent } = React.useContext(NodeExpandedAllContext)
  const expandedContext = useState(true)
  const isCollapsible = props.collapsible ?? true

  const hasSemanticZoomSummary = props.semanticZoomSummary !== undefined
  const isSemanticZoom = useSemanticZoom(props.nodeProps.id, hasSemanticZoomSummary)

  const semanticFillColor = props.topBarColor ?? NODE_TYPE_COLORS.generic

  const barRadiusStyle = useMemo(() => {
    const s = props.style
    if (!s) return undefined
    return {
      borderRadius: s.borderRadius,
      borderTopLeftRadius: s.borderTopLeftRadius,
      borderBottomLeftRadius: s.borderBottomLeftRadius,
    }
  }, [props.style])

  useEffect(() => {
    if (!isCollapsible) return

    const expandListener = () => {
      expandedContext[1](true)
    }
    const collapseListener = () => {
      expandedContext[1](false)
    }
    expandAllEvent.addEventListener('expandAll', expandListener)
    collapseAllEvent.addEventListener('collapseAll', collapseListener)
    return () => {
      expandAllEvent.removeEventListener('expandAll', expandListener)
      collapseAllEvent.removeEventListener('collapseAll', collapseListener)
    }
  }, [expandAllEvent, collapseAllEvent, expandedContext, isCollapsible])

  const isSelected = props.nodeProps.selected
  const nodeWidth = isWideTaskNode(props.nodeProps) ? WIDE_NODE_WIDTH : DEFAULT_NODE_WIDTH
  const summary = props.semanticZoomSummary

  const panelStyle: React.CSSProperties = {
    overflow: 'visible', // Allow execution badge to overflow outside node
    cursor: props.onClick || props.hasDashedBorder ? 'pointer' : undefined,
    width: `${nodeWidth}px`, // Fixed width for consistent node sizing
    minWidth: `${nodeWidth}px`,
    maxWidth: `${nodeWidth}px`,
    ...WORKFLOW_NODE_PANEL_RADIUS_STYLE,
    ...(isSemanticZoom
      ? {
          border: 'none',
          ...props.style,
        }
      : {
          // Type indicator: top border in type color when not selected (full top bar, no dashed).
          // Use longhands and border: 'none' so the top bar is visible and shorthand doesn't stick after deselect.
          ...(props.topBarColor &&
            !isSelected &&
            !props.hasDashedBorder && {
              border: 'none',
              borderTopWidth: 4,
              borderTopStyle: 'solid',
              borderTopColor: props.topBarColor,
            }),
          // Dashed placeholder (e.g. GenericNode): full dashed outline, no type-colored top bar.
          ...(props.hasDashedBorder &&
            !isSelected && {
              border: '2px dashed rgba(196, 181, 253, 0.5)',
              borderWidth: '2px',
              borderStyle: 'dashed',
              borderColor: 'rgba(196, 181, 253, 0.5)',
            }),
          // Full brand border when selected (replaces type top bar while selected)
          ...(isSelected &&
            !props.hasDashedBorder && {
              border: '2px solid var(--pf-t--global--color--brand--default)',
            }),
          // Apply selected + dashed border
          ...(isSelected &&
            props.hasDashedBorder && {
              border: '2px dashed var(--pf-t--global--color--brand--default)',
            }),
          ...props.style, // Merge with custom styles (will override borders if specified)
        }),
  }

  return (
    <NodeExpandedContext.Provider value={expandedContext}>
      <AppPanel
        hasNoPadding
        variant="raised"
        className={props.className}
        data-testid={props.rootTestId}
        onClick={props.onClick}
        style={panelStyle}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (props.onClick && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            props.onClick(e as unknown as React.MouseEvent<HTMLDivElement, MouseEvent>)
          }
        }}
        role={props.onClick ? 'button' : undefined}
        tabIndex={props.onClick ? 0 : undefined}
      >
        {isSemanticZoom && summary ? (
          <NodeSemanticZoomBody
            title={summary.title}
            typeLabel={summary.typeLabel}
            backgroundColor={semanticFillColor}
            branchSources={props.semanticZoomBranchSources}
            selected={isSelected}
            hasDashedBorder={props.hasDashedBorder ?? false}
            barStyle={barRadiusStyle}
          />
        ) : (
          props.children
        )}
        {!isSemanticZoom && props.showExecutionBadge !== false && props.executionState && (
          <ExecutionStatusBadge
            status={props.executionState?.status ?? 'pending'}
            retryCount={props.executionState?.retry_count}
          />
        )}
        {!props.disableTarget && (
          <Handle
            type="target"
            id="target"
            position={props.reverseHandles ? Position.Right : Position.Left}
            style={targetHandleStyle}
          />
        )}
        {!props.disableSource && (
          <Handle
            type="source"
            id="source"
            position={props.reverseHandles ? Position.Left : Position.Right}
            style={sourceHandleStyle}
          />
        )}
        {props.enableStart && (
          <Handle type="source" id="start" position={Position.Right} style={{ ...sourceHandleStyle, top: '85%' }} />
        )}
        {props.enableEnd && (
          <Handle
            type="target"
            id="end"
            position={Position.Left}
            style={{
              ...targetHandleStyle,
              top: '50%', // Same position as main target handle
              opacity: 0, // Invisible
              pointerEvents: 'none', // Non-interactive
            }}
          />
        )}
      </AppPanel>
    </NodeExpandedContext.Provider>
  )
}
