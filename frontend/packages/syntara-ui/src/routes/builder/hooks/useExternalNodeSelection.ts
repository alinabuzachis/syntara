import type { Dispatch, SetStateAction } from 'react'
import { useEffect } from 'react'

import type { NodeType } from '../../workflows/canvas/nodes/NodeType'

export function useExternalNodeSelection(
  selectedActivityId: string | null | undefined,
  setNodes: Dispatch<SetStateAction<NodeType[]>>
) {
  useEffect(() => {
    if (selectedActivityId == null) return
    setNodes((prev) =>
      prev.map((n) => {
        const defId = 'definitionId' in n.data ? n.data.definitionId : undefined
        const matches = n.id === selectedActivityId || defId === selectedActivityId
        if (n.selected === matches) return n
        return { ...n, selected: matches }
      })
    )
  }, [selectedActivityId, setNodes])
}
