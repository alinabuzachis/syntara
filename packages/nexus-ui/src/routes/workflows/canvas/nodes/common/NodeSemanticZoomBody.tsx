import { Content, ContentVariants, Stack, StackItem, Tooltip } from '@patternfly/react-core'
import type { CSSProperties, ReactNode } from 'react'

import { SEMANTIC_ZOOM_BAR_HEIGHT_PX } from '../../semanticZoom'
import type { SemanticZoomBranchSource } from '../../semanticZoomTypes'

import { SemanticZoomBranchSourceHandles } from './SemanticZoomBranchSourceHandles'

export function NodeSemanticZoomBody(props: {
  title: string
  typeLabel: string
  backgroundColor: string
  /** Invisible source handles on the bar right edge (branching nodes only). */
  branchSources?: readonly SemanticZoomBranchSource[]
  selected: boolean
  hasDashedBorder: boolean
  /** Pass-through from node (e.g. trigger pill radii on the color bar). */
  barStyle?: Pick<CSSProperties, 'borderRadius' | 'borderTopLeftRadius' | 'borderBottomLeftRadius'>
}): ReactNode {
  /** Tooltip surface uses inverse background; Content’s default text color is for the main page and reads as white here. */
  const tooltipTextColor = 'var(--pf-t--global--text--color--inverse)'

  const tooltipContent = (
    <Stack style={{ textAlign: 'center', color: tooltipTextColor }}>
      <StackItem>
        <Content
          component="p"
          style={{
            margin: 0,
            color: tooltipTextColor,
            fontWeight: 'var(--pf-t--global--font--weight--heading--default)',
          }}
        >
          {props.title}
        </Content>
      </StackItem>
      <StackItem>
        <Content
          component={ContentVariants.small}
          style={{
            margin: 0,
            color: tooltipTextColor,
            opacity: 0.82,
          }}
        >
          {props.typeLabel}
        </Content>
      </StackItem>
    </Stack>
  )

  const baseBarStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    minHeight: '100%',
    backgroundColor: props.backgroundColor,
    boxSizing: 'border-box',
    ...props.barStyle,
  }

  if (props.hasDashedBorder && !props.selected) {
    baseBarStyle.border = '2px dashed rgba(196, 181, 253, 0.5)'
  } else if (props.selected) {
    baseBarStyle.outline = '2px solid var(--pf-t--global--color--brand--default)'
    baseBarStyle.outlineOffset = 2
  }

  const rowStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    height: SEMANTIC_ZOOM_BAR_HEIGHT_PX,
    minHeight: SEMANTIC_ZOOM_BAR_HEIGHT_PX,
    // Not role=button, but the node still selects / opens the builder detail path like full-size nodes
    cursor: 'pointer',
  }

  return (
    <div style={rowStyle}>
      <Tooltip content={tooltipContent} position="top">
        {/*
          PatternFly Tooltip opens on focus; tabIndex gives keyboard users a trigger. role="group" + aria-label
          name the bar for SRs (not a button).
        */}
        {/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- focus target for tooltip; group is not a button */}
        <div
          role="group"
          aria-label={`${props.title}, ${props.typeLabel}`}
          tabIndex={0}
          style={{
            width: '100%',
            height: '100%',
          }}
        >
          <div style={baseBarStyle} />
        </div>
        {/* eslint-enable jsx-a11y/no-noninteractive-tabindex */}
      </Tooltip>
      <SemanticZoomBranchSourceHandles handles={props.branchSources ?? []} />
    </div>
  )
}
