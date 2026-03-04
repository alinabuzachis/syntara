import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'

import '@xyflow/react/dist/style.css'
import { workflowClient } from '../../client'
import { BuilderContent } from './BuilderContent'
import { WORKFLOWS_LIST_PARAMS_FOR_DEFAULT_NAME } from './utils/workflowListQuery'

export default function BuilderNew() {
  const queryClient = useQueryClient()
  useEffect(() => {
    queryClient.prefetchQuery(workflowClient.queryOptions('get', '/workflows', WORKFLOWS_LIST_PARAMS_FOR_DEFAULT_NAME))
  }, [queryClient])

  return (
    <ReactFlowProvider>
      <BuilderContent isNew={true} workflowId={null} />
    </ReactFlowProvider>
  )
}
