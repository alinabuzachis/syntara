import { useCallback, useRef } from 'react'

import { useAlerts } from '../../components/alerts'
import { useWorkflowStore } from '../../stores/useWorkflowStore'
import { getErrorMessage } from '../../utils/apiErrors'
import { downloadWorkflowDefinition, parseWorkflowFile, validateFileSize } from '../../utils/downloadWorkflowExport'

import type { BuilderAction } from './builderReducer'
import { loadDefinitionIntoStore } from './utils/loadDefinitionIntoStore'
import { buildWorkflowDefinition } from './utils/workflowDefinitionBuilder'

type UseWorkflowImportExportOptions = Readonly<{
  dispatch: (action: BuilderAction) => void
  markDirty: () => void
}>

export function useWorkflowImportExport({ dispatch, markDirty }: UseWorkflowImportExportOptions) {
  const importFileRef = useRef<HTMLInputElement>(null)
  const { showError } = useAlerts()

  const handleImportFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      Promise.resolve()
        .then(() => validateFileSize(file))
        .then(() => file.text())
        .then((content) => {
          const definition = parseWorkflowFile(content, file.name)
          const { workflowDef, edges } = loadDefinitionIntoStore(definition)

          useWorkflowStore.getState().replaceWorkflowContent(workflowDef, edges)

          if (definition.name && typeof definition.name === 'string') {
            const name = definition.name.slice(0, 255)
            dispatch({ type: 'SET_WORKFLOW_NAME', payload: name })
            if (definition.name.length > 255) {
              showError({ title: 'Import note', description: 'Workflow name was truncated to 255 characters' })
            }
          }
          if (definition.description && typeof definition.description === 'string') {
            const description = definition.description.slice(0, 1024)
            dispatch({ type: 'SET_WORKFLOW_DESCRIPTION', payload: description })
            if (definition.description.length > 1024) {
              showError({
                title: 'Import note',
                description: 'Workflow description was truncated to 1024 characters',
              })
            }
          }

          markDirty()
        })
        .catch((err: unknown) => {
          showError({ title: 'Import failed', description: getErrorMessage(err) })
        })

      event.target.value = ''
    },
    [dispatch, markDirty, showError]
  )

  const handleExport = useCallback(() => {
    const { currentWorkflow, edges } = useWorkflowStore.getState()
    if (!currentWorkflow) {
      dispatch({ type: 'SET_KEBAB_OPEN', payload: false })
      return
    }
    try {
      const { activities } = currentWorkflow.workflow
      const triggers = currentWorkflow.triggers ?? []
      const name = currentWorkflow.name ?? 'workflow'
      const description = currentWorkflow.description ?? ''
      const definition = buildWorkflowDefinition(name, description, activities, triggers, edges)
      downloadWorkflowDefinition(definition as Record<string, unknown>, name)
    } catch (err: unknown) {
      showError({ title: 'Export failed', description: getErrorMessage(err) })
    }
    dispatch({ type: 'SET_KEBAB_OPEN', payload: false })
  }, [dispatch, showError])

  return { importFileRef, handleImportFile, handleExport }
}
