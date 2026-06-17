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
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'

import { workflowFetchClient } from '../../client'
import { useNavigate } from '../../hooks/routing/useNavigate'
import { useProjectSelector } from '../../hooks/useProjectSelector'
import { useAlerts } from '../../providers/alerts'
import { getErrorMessage } from '../../utils/apiErrors'
import { detachPromise } from '../../utils/detachPromise'
import { parseWorkflowFile, validateFileSize } from '../../utils/downloadWorkflowExport'

import { importWorkflowSchema } from './importWorkflowSchema'
import type { ImportWorkflowFormData } from './importWorkflowSchema'

type ImportWorkflowDialogProps = Readonly<{
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}>

export function ImportWorkflowDialog({ isOpen, onClose, onSuccess }: ImportWorkflowDialogProps) {
  const { showAlert, showError } = useAlerts()
  const setLocation = useNavigate()
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
      // parseWorkflowFile runtime-validates triggers/nodes/edges arrays
      const definition = parseWorkflowFile(content, file.name)

      const fullDefinition = {
        schema_version: '2.0.0' as const,
        name: data.name,
        description: '',
        triggers: definition.triggers,
        nodes: definition.nodes,
        edges: definition.edges,
      }

      const { data: result, error } = await workflowFetchClient.POST('/workflows', {
        body: {
          name: data.name,
          workflow_definition: fullDefinition as V2WorkflowDefinition,
          project_id: selectedProjectId,
        },
      })

      if (error) {
        showError({ title: 'Import failed', description: getErrorMessage(error) })
        return
      }

      const createdId = result?.id
      showAlert({
        variant: 'success',
        autoDismiss: true,
        title: 'Workflow imported',
        description: `Created "${data.name}"`,
        actionLinks: createdId ? (
          <AlertActionLink onClick={() => setLocation(`/workflow-builder/${createdId}`)}>Open workflow</AlertActionLink>
        ) : undefined,
      })
      handleClose()
      onSuccess()
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
