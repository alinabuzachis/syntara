import { IconButton } from '@ansible/nexus-ui-framework'
import { Panel, useReactFlow } from '@xyflow/react'
import {
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  FullscreenIcon,
  UnfoldHorizontalIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react'
import { useContext } from 'react'
import { FlowDirectionContext } from './FlowDirectionContext'

export function CanvasControls() {
  const [, setFlowDirection] = useContext(FlowDirectionContext)
  const { fitView, zoomIn, zoomOut } = useReactFlow()

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
      {/* <IconButton onClick={() => setFlowDirection('TB')}>
        <MoveVerticalIcon />
      </IconButton> */}
      <IconButton onClick={() => setFlowDirection('LR')}>
        <UnfoldHorizontalIcon />
      </IconButton>
      {/* <button onClick={() => fitView()}>
        <FullscreenIcon />
      </button> */}
      <IconButton>
        <ChevronsDownUpIcon />
      </IconButton>
      <IconButton>
        <ChevronsUpDownIcon />
      </IconButton>
    </Panel>
  )
}
