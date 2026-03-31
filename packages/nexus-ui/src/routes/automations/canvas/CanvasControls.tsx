import { Button, CompassPanel, Flex, FlexItem, Icon, Popover } from '@patternfly/react-core'
import {
  RhStandardCompassIcon,
  RhUiCaretDownIcon,
  RhUiCaretUpIcon,
  RhUiCleanUpFillIcon,
  RhUiExpandArrowsIcon,
  RhUiZoomInIcon,
  RhUiZoomOutIcon,
} from '@patternfly/react-icons'
import { Panel, useReactFlow } from '@xyflow/react'
import React, { useCallback, useRef, useState } from 'react'

import { CanvasLegend } from './CanvasLegend'
import { NodeExpandedAllContext } from './nodes/common/NodeExpandedAllContext'

const LEGEND_REGION_ID = 'workflow-canvas-legend'

export function CanvasControls(props: { onLayout: () => void; hideLayout?: boolean }) {
  const { fitView, zoomIn, zoomOut } = useReactFlow()
  const { expandAllEvent, collapseAllEvent } = React.useContext(NodeExpandedAllContext)
  const [legendOpen, setLegendOpen] = useState(false)
  const legendToggleRef = useRef<HTMLButtonElement>(null)

  const closeLegend = useCallback(() => {
    setLegendOpen(false)
    requestAnimationFrame(() => {
      legendToggleRef.current?.focus()
    })
  }, [])

  const handleLegendShouldClose = useCallback(
    (_event: MouseEvent | KeyboardEvent, hide?: () => void) => {
      hide?.()
      closeLegend()
    },
    [closeLegend]
  )

  return (
    <Panel position="bottom-left">
      <CompassPanel isPill hasNoPadding>
        <Flex gap={{ default: 'gapNone' }}>
          <FlexItem>
            <Popover
              isVisible={legendOpen}
              position="top-start"
              shouldOpen={() => setLegendOpen(true)}
              shouldClose={handleLegendShouldClose}
              showClose={false}
              hasNoPadding
              hasAutoWidth
              aria-label="Legend"
              bodyContent={(hide) =>
                legendOpen ? <CanvasLegend hide={hide} onClose={closeLegend} regionId={LEGEND_REGION_ID} /> : null
              }
            >
              <Button
                ref={legendToggleRef}
                variant="plain"
                isClicked={legendOpen}
                aria-label={legendOpen ? 'Hide node legend' : 'Show node legend'}
                aria-expanded={legendOpen}
                aria-controls={legendOpen ? LEGEND_REGION_ID : undefined}
                aria-pressed={legendOpen}
                icon={
                  <Icon isInline>
                    <RhStandardCompassIcon />
                  </Icon>
                }
              />
            </Popover>
          </FlexItem>
          <FlexItem>
            <Button
              variant="plain"
              onClick={() => zoomIn()}
              aria-label="Zoom in"
              icon={
                <Icon isInline>
                  <RhUiZoomInIcon />
                </Icon>
              }
            />
          </FlexItem>
          <FlexItem>
            <Button
              variant="plain"
              onClick={() => zoomOut()}
              aria-label="Zoom out"
              icon={
                <Icon isInline>
                  <RhUiZoomOutIcon />
                </Icon>
              }
            />
          </FlexItem>
          <FlexItem>
            <Button
              variant="plain"
              onClick={() => fitView()}
              aria-label="Fit view"
              icon={
                <Icon isInline>
                  <RhUiExpandArrowsIcon />
                </Icon>
              }
            />
          </FlexItem>
          {!props.hideLayout && (
            <>
              <FlexItem>
                <Button
                  variant="plain"
                  onClick={() => collapseAllEvent.dispatchEvent(new Event('collapseAll'))}
                  aria-label="Collapse all"
                  icon={
                    <Icon isInline>
                      <RhUiCaretUpIcon />
                    </Icon>
                  }
                />
              </FlexItem>
              <FlexItem>
                <Button
                  variant="plain"
                  onClick={() => expandAllEvent.dispatchEvent(new Event('expandAll'))}
                  aria-label="Expand all"
                  icon={
                    <Icon isInline>
                      <RhUiCaretDownIcon />
                    </Icon>
                  }
                />
              </FlexItem>
              <FlexItem>
                <Button
                  variant="plain"
                  onClick={() => props.onLayout()}
                  aria-label="Layout"
                  icon={
                    <Icon isInline>
                      <RhUiCleanUpFillIcon />
                    </Icon>
                  }
                />
              </FlexItem>
            </>
          )}
        </Flex>
      </CompassPanel>
    </Panel>
  )
}
