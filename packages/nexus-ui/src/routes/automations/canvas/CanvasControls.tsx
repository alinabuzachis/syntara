import { CompassPanel } from '@ansible/nexus-ui-framework'
import { Button, Flex, FlexItem, Icon } from '@patternfly/react-core'
import {
  RhUiOptimizeIcon,
  RhUiCaretDownIcon,
  RhUiCaretUpIcon,
  RhUiExpandArrowsIcon,
  RhUiZoomInIcon,
  RhUiZoomOutIcon,
} from '@patternfly/react-icons'
import { Panel, useReactFlow } from '@xyflow/react'
import React from 'react'

import { NodeExpandedAllContext } from './nodes/common/NodeExpandedAllContext'

export function CanvasControls(props: { onLayout: () => void }) {
  // const [, setFlowDirection] = useContext(FlowDirectionContext)
  const { fitView, zoomIn, zoomOut } = useReactFlow()
  const { expandAllEvent, collapseAllEvent } = React.useContext(NodeExpandedAllContext)

  return (
    <Panel position="bottom-left">
      <CompassPanel isPill hasNoPadding>
        <Flex gap={{ default: 'gapNone' }}>
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
          <FlexItem>
            <Button
              variant="plain"
              onClick={() => expandAllEvent.dispatchEvent(new Event('expandAll'))}
              aria-label="Expand all"
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
              onClick={() => collapseAllEvent.dispatchEvent(new Event('collapseAll'))}
              aria-label="Collapse all"
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
                  <RhUiOptimizeIcon />
                </Icon>
              }
            />
          </FlexItem>
        </Flex>
      </CompassPanel>
    </Panel>
  )
}
