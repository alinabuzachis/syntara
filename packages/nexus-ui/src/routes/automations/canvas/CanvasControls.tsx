import { IconButton } from '@ansible/nexus-ui-framework'
import { Panel, useReactFlow } from '@xyflow/react'
import { FullscreenIcon, ZoomInIcon, ZoomOutIcon } from 'lucide-react'

export function CanvasControls() {
  // const [, setFlowDirection] = useContext(FlowDirectionContext)
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
      {/* <IconButton onClick={() => setFlowDirection('LR')}>
        <BrushCleaning />
      </IconButton> */}
      {/* <IconButton>
        <ChevronsDownUpIcon />
      </IconButton> */}
      {/* <IconButton>
        <ChevronsUpDownIcon />
      </IconButton> */}
      {/* <button onClick={() => fitView()}>
        <FullscreenIcon />
      </button> */}
    </Panel>
  )
}
