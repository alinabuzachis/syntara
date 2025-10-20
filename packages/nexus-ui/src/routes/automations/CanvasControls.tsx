import { IconButton } from '@ansible/nexus-ui-framework'
import { Panel, useReactFlow } from '@xyflow/react'
import { ExpandIcon, MoveHorizontalIcon, MoveVerticalIcon, ZoomInIcon, ZoomOutIcon } from 'lucide-react'
import { useContext } from 'react'
import { FlowDirectionContext } from './FlowDirectionContext'

export function CanvasControls() {
  const [, setFlowDirection] = useContext(FlowDirectionContext)
  const { fitView, zoomIn, zoomOut } = useReactFlow()

  return (
    <Panel position="bottom-left" className="card flex rounded-full">
      <IconButton onClick={() => zoomIn()}>
        <ZoomInIcon />
      </IconButton>
      <IconButton onClick={() => zoomOut()}>
        <ZoomOutIcon />
      </IconButton>
      <IconButton onClick={() => fitView()}>
        <ExpandIcon />
      </IconButton>
      <IconButton onClick={() => setFlowDirection('TB')}>
        <MoveVerticalIcon />
      </IconButton>
      <IconButton onClick={() => setFlowDirection('LR')}>
        <MoveHorizontalIcon />
      </IconButton>
      {/* <button onClick={() => fitView()}>
        <FullscreenIcon />
      </button> */}
    </Panel>
  )
}
