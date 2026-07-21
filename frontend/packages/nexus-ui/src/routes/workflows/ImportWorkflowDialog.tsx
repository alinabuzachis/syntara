import type { V2WorkflowDefinition } from '@ansible/nexus-contracts'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  AlertActionLink,
  Button,
  FileUpload,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextInput,
} from '@patternfly/react-core'
import type { DropEvent } from '@patternfly/react-core'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'

import { workflowFetchClient } from '../../client'
import { useProjectSelector } from '../../hooks/useProjectSelector'
import { useAlerts } from '../../providers/alerts'
import { getErrorMessage, isRetryableValidationError } from '../../utils/apiErrors'
import { detachPromise } from '../../utils/detachPromise'
import { parseWorkflowFile, validateFileSize } from '../../utils/downloadWorkflowExport'
import { forceCreateWorkflow } from '../../utils/workflowForceSave'

import { importWorkflowSchema } from './importWorkflowSchema'
import type { ImportWorkflowFormData } from './importWorkflowSchema'

/**
 * Builds a full V2WorkflowDefinition from a parsed file and the user-supplied name.
 */
function buildFullDefinition(parsed: ReturnType<typeof parseWorkflowFile>, name: string): V2WorkflowDefinition {
  const description =
    parsed.description && typeof parsed.description === 'string' && parsed.description.trim()
      ? parsed.description
      : undefined

  return {
    schema_version: '2.0.0',
    name,
    triggers: parsed.triggers as V2WorkflowDefinition['triggers'],
    nodes: parsed.nodes as V2WorkflowDefinition['nodes'],
    edges: parsed.edges as V2WorkflowDefinition['edges'],
    ...(description !== undefined && { description }),
  }
}

type ImportWorkflowDialogProps = Readonly<{
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}>

export function ImportWorkflowDialog({ isOpen, onClose, onSuccess }: ImportWorkflowDialogProps) {
  const { showAlert, showError } = useAlerts()
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [filename, setFilename] = useState('')
  const [fileError, setFileError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveAttemptedWithoutProject, setSaveAttemptedWithoutProject] = useState(false)

  const { selectedProjectId, ProjectSelector } = useProjectSelector({
    requireProject: true,
    hasValidationError: saveAttemptedWithoutProject,
    onProjectSelect: () => setSaveAttemptedWithoutProject(false),
  })

  const formMethods = useForm<ImportWorkflowFormData>({
    resolver: zodResolver(importWorkflowSchema, undefined, { mode: 'sync' }),
    defaultValues: {
      name: '',
    },
  })

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = formMethods

  const handleClose = () => {
    reset({ name: '' })
    setFile(null)
    setFilename('')
    setFileError(null)
    setSaveAttemptedWithoutProject(false)
    onClose()
  }

  const handleFileInputChange = (_event: DropEvent, inputFile: File) => {
    setFileError(null)
    setFile(inputFile)
    setFilename(inputFile.name)
  }

  const handleFileClear = () => {
    setFile(null)
    setFilename('')
    setFileError(null)
  }

  const onImportSuccess = (wfName: string, createdId?: string, hasWarnings?: boolean) => {
    const title = hasWarnings ? 'Workflow imported with warnings' : 'Workflow imported'
    const description = hasWarnings ? `Created "${wfName}" (has validation warnings)` : `Created "${wfName}"`
    const openInEditor = createdId
      ? () => detachPromise(navigate({ to: '/workflow-builder/$workflowId', params: { workflowId: createdId } }))
      : undefined
    const actionLinks = createdId ? <AlertActionLink onClick={openInEditor}>Open workflow</AlertActionLink> : undefined
    showAlert({ variant: 'success', autoDismiss: true, title, description, actionLinks })
    handleClose()
    onSuccess()
  }

  const handleForceSave = async (wfName: string, definition: V2WorkflowDefinition, projectId: string) => {
    setIsSaving(true)
    try {
      const { data: result, error } = await forceCreateWorkflow({
        name: wfName,
        workflow_definition: definition,
        project_id: projectId,
      })
      if (error) {
        showError({ title: 'Import failed', description: getErrorMessage(error) })
        return
      }
      onImportSuccess(wfName, result?.id, true)
    } finally {
      setIsSaving(false)
    }
  }

  const onSubmit = async (data: ImportWorkflowFormData) => {
    if (!file) return

    if (!selectedProjectId) {
      setSaveAttemptedWithoutProject(true)
      showError({ title: 'Project required', description: 'Please select a project to import this workflow.' })
      return
    }

    setIsSaving(true)
    setFileError(null)

    try {
      validateFileSize(file)
      const content = await file.text()
      const parsed = parseWorkflowFile(content, file.name)
      const fullDefinition = buildFullDefinition(parsed, data.name)

      const { data: result, error } = await workflowFetchClient.POST('/workflows', {
        body: {
          name: data.name,
          workflow_definition: fullDefinition,
          project_id: selectedProjectId,
        },
      })

      if (error) {
        if (isRetryableValidationError(error)) {
          showAlert({
            variant: 'warning',
            title: 'Workflow imported with warnings',
            description: `"${data.name}" has been saved with validation warnings.`,
            actionLinks: (
              <AlertActionLink
                onClick={() => detachPromise(handleForceSave(data.name, fullDefinition, selectedProjectId))}
              >
                Save anyway
              </AlertActionLink>
            ),
          })
          return
        }
        showError({ title: 'Import failed', description: getErrorMessage(error) })
        return
      }

      onImportSuccess(data.name, result?.id)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to parse file'
      setFileError(message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} variant="small" aria-label="Import workflow">
      <ModalHeader title="Import workflow" />
      <ModalBody>
        <Form>
          <FormGroup label="Workflow file" fieldId="import-file" isRequired>
            <FileUpload
              id="import-file"
              value={file ?? undefined}
              filename={filename}
              filenamePlaceholder="Drag and drop a file or upload one"
              onFileInputChange={handleFileInputChange}
              onClearClick={handleFileClear}
              browseButtonText="Upload"
              dropzoneProps={{ accept: { 'application/json': ['.json'] } }}
              validated={fileError ? 'error' : 'default'}
              hideDefaultPreview
            />
            {fileError && (
              <HelperText>
                <HelperTextItem variant="error">{fileError}</HelperTextItem>
              </HelperText>
            )}
          </FormGroup>

          <FormGroup label="Workflow name" fieldId="import-name" isRequired>
            <Controller
              name="name"
              control={control}
              render={({ field }) => (
                <TextInput
                  id="import-name"
                  type="text"
                  value={field.value}
                  onChange={(_event, value) => field.onChange(value)}
                  placeholder="Enter a name for the imported workflow"
                  isRequired
                  validated={errors.name ? 'error' : 'default'}
                />
              )}
            />
            {errors.name && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">{errors.name.message}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup label="Project" fieldId="import-project" isRequired>
            {ProjectSelector}
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={() => detachPromise(handleSubmit(onSubmit)())}
          isDisabled={!file || isSaving}
          isLoading={isSaving}
        >
          Import
        </Button>
        <Button variant="link" onClick={handleClose} isDisabled={isSaving}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
