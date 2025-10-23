import { IconButton } from '@ansible/nexus-ui-framework'
import { Panel, useReactFlow } from '@xyflow/react'
import {
  BrushCleaningIcon,
  ChevronsDownIcon,
  ChevronsUpIcon,
  FullscreenIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react'
import React from 'react'
import { NodeExpandedAllContext } from './nodes/common/NodeExpandedAllContext'

export function CanvasControls(props: { onLayout: () => void }) {
  // const [, setFlowDirection] = useContext(FlowDirectionContext)
  const { fitView, zoomIn, zoomOut } = useReactFlow()
  const { expandAllEvent, collapseAllEvent } = React.useContext(NodeExpandedAllContext)

  return (
    <Panel position="bottom-left" className="glass card flex rounded-full border-2">
      <IconButton onClick={() => zoomIn()}>
        <ZoomInIcon />
      </IconButton>
      <IconButton onClick={() => zoomOut()}>
        <ZoomOutIcon />
      </IconButton>
      <IconButton onClick={() => fitView()}>
        <FullscreenIcon />
      </IconButton>
      <IconButton onClick={() => expandAllEvent.dispatchEvent(new Event('expandAll'))}>
        <ChevronsUpIcon />
      </IconButton>
      <IconButton onClick={() => collapseAllEvent.dispatchEvent(new Event('collapseAll'))}>
        <ChevronsDownIcon />
      </IconButton>
      <IconButton onClick={() => props.onLayout()}>
        <BrushCleaningIcon />
      </IconButton>
      {/* <button onClick={() => fitView()}>
        <FullscreenIcon />
      </button> */}
    </Panel>
  )
}
