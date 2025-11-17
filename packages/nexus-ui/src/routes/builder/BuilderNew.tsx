import { ReactFlowProvider } from '@xyflow/react'

import '@xyflow/react/dist/style.css'
import { BuilderContent } from './BuilderContent'

export default function BuilderNew() {
  return (
    <ReactFlowProvider>
      <BuilderContent isNew={true} workflowId={null} />
    </ReactFlowProvider>
  )
}
