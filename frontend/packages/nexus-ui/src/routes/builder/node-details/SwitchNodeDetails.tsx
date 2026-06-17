import { EdgeHandleEnum, type SwitchActivity, type SwitchConfig } from '@ansible/nexus-contracts'
import { type ReactNode, useMemo } from 'react'

import { useAlerts } from '../../../providers/alerts'
import { useWorkflowStore, useWorkflowStoreActions } from '../../../stores/useWorkflowStore'
import { SwitchNodeForm, type SwitchFormData } from '../node-forms/SwitchNodeForm'
import { buildSwitchCasePort, isSwitchCasePort } from '../utils/switchCaseHelpers'

type SwitchNodeDetailsProps = {
  switchData: SwitchActivity
  nodeId: string
  onClose: () => void
  onHeaderContentChange?: (content: ReactNode | null) => void
}

export function SwitchNodeDetails({ switchData, nodeId, onClose, onHeaderContentChange }: SwitchNodeDetailsProps) {
  const { showError } = useAlerts()
  const { updateActivity } = useWorkflowStoreActions()

  const switchConfig = (switchData.parameters ?? { cases: [] }) as SwitchConfig

  const { initialCases, oldCaseIdToPort } = useMemo(() => {
    const portMap = new Map<string, string>()
    const cases =
      switchConfig.cases?.map((c, i) => {
        portMap.set(c.port, c.port)
        return {
          caseId: c.port,
          label: c.label || `Path ${i + 1}`,
          condition: c.condition,
        }
      }) ?? []
    return { initialCases: cases, oldCaseIdToPort: portMap }
  }, [switchConfig.cases])

  const initialData: Partial<SwitchFormData> = {
    name: switchData.name,
    cases: initialCases,
  }

  const handleSubmit = (data: SwitchFormData) => {
    try {
      const newCases = data.cases.map((c, i) => ({
        port: buildSwitchCasePort(i),
        label: c.label || `Path ${i + 1}`,
        condition: c.condition,
      }))

      const updatedActivity: SwitchActivity = {
        ...switchData,
        name: data.name,
        parameters: {
          cases: newCases,
          default_port: EdgeHandleEnum.DEFAULT,
        },
      } as SwitchActivity

      const portMapping = new Map<string, string>()
      data.cases.forEach((formCase, newIdx) => {
        const oldPort = oldCaseIdToPort.get(formCase.caseId)
        if (oldPort) {
          portMapping.set(oldPort, buildSwitchCasePort(newIdx))
        }
      })

      updateActivity(nodeId, updatedActivity)

      const currentEdges = useWorkflowStore.getState().edges
      const updatedEdges = currentEdges
        .map((edge) => {
          if (edge.source !== nodeId) return edge
          const handle = edge.sourceHandle
          if (!handle || handle === EdgeHandleEnum.DEFAULT) return edge
          if (isSwitchCasePort(handle)) {
            const newHandle = portMapping.get(handle)
            return newHandle ? { ...edge, sourceHandle: newHandle } : null
          }
          return edge
        })
        .filter((edge): edge is NonNullable<typeof edge> => edge !== null)

      useWorkflowStore.getState().setEdges(updatedEdges)

      onClose()
    } catch (error) {
      showError({
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Failed to update step',
      })
    }
  }

  return (
    <SwitchNodeForm initialData={initialData} onSubmit={handleSubmit} onHeaderContentChange={onHeaderContentChange} />
  )
}
