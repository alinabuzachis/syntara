import { EdgeHandleEnum, type SwitchActivity, type SwitchConfig } from '@ansible/nexus-contracts'
import { type ReactNode, useMemo } from 'react'

import { useAlerts } from '../../../providers/alerts'
import { useWorkflowStore, useWorkflowStoreActions } from '../../../stores/useWorkflowStore'
import { parseExpression } from '../../../utils/expressions/parser'
import { SwitchNodeForm, type SwitchFormData } from '../node-forms/SwitchNodeForm'
import { buildSwitchCasePort, isSwitchCasePort, serializeSwitchCases } from '../utils/switchCaseHelpers'

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
        const parsed = parseExpression(c.condition)
        const caseId = parsed.root?.type === 'condition' ? parsed.root.id || c.port : c.port
        portMap.set(caseId, c.port)

        if (parsed.root?.type === 'condition') {
          return {
            id: caseId,
            label: c.label || `Path ${i + 1}`,
            variable: parsed.root.variable,
            operator: parsed.root.operator,
            value: parsed.root.value,
            negate: parsed.root.negate ?? false,
          }
        }
        return {
          id: caseId,
          label: c.label || `Path ${i + 1}`,
          variable: c.condition,
          operator: '==' as const,
          value: '',
          negate: false,
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
      const newCases = serializeSwitchCases(data.cases)

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
        const oldPort = oldCaseIdToPort.get(formCase.id)
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
