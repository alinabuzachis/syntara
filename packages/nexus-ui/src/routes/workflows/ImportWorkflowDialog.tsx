import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Button,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextInput,
} from '@patternfly/react-core'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'

import { workflowFetchClient } from '../../client'
import { useAlerts } from '../../providers/alerts'
import { getErrorMessage } from '../../utils/apiErrors'
import { detachPromise } from '../../utils/detachPromise'
import { parseWorkflowFile, validateFileSize } from '../../utils/downloadWorkflowExport'
import type { ProjectRead } from '../access/types'

import { importWorkflowSchema } from './importWorkflowSchema'
import type { ImportWorkflowFormData } from './importWorkflowSchema'

type ImportWorkflowDialogProps = Readonly<{
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  defaultProjectId?: string | null
  projects: ProjectRead[]
}>

export function ImportWorkflowDialog({
  isOpen,
  onClose,
  onSuccess,
  defaultProjectId,
  projects,
}: ImportWorkflowDialogProps) {
  const { showSuccess, showError } = useAlerts()
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ImportWorkflowFormData>({
    resolver: zodResolver(importWorkflowSchema, undefined, { mode: 'sync' }),
    defaultValues: {
      name: '',
      projectId: defaultProjectId ?? '',
    },
  })

  useEffect(() => {
    if (isOpen) {
      reset({ name: '', projectId: defaultProjectId ?? '' })
      setFile(null)
      setFileError(null)
    }
  }, [isOpen, defaultProjectId, reset])

  const handleClose = () => {
    onClose()
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null)
    const selected = event.target.files?.[0] ?? null
    setFile(selected)
  }

  const onSubmit = async (data: ImportWorkflowFormData) => {
    if (!file) return

    setIsSaving(true)
    setFileError(null)

    try {
      validateFileSize(file)
      const content = await file.text()
      const definition = parseWorkflowFile(content, file.name)

      type WorkflowDefinitionSchema = WorkflowAPI.components['schemas']['workflow_definition.schema']

      const { triggers, nodes, edges } = definition as { triggers: unknown[]; nodes: unknown[]; edges: unknown[] }
      const fullDefinition = {
        schema_version: '2.0.0',
        name: data.name,
        description: '',
        triggers,
        nodes,
        edges,
      }

      const effectiveProjectId = data.projectId || null

      const { error } = await workflowFetchClient.POST('/workflows', {
        body: {
          name: data.name,
          workflow_definition: fullDefinition as unknown as WorkflowDefinitionSchema,
          ...(effectiveProjectId ? { project_id: effectiveProjectId } : {}),
        },
      })

      if (error) {
        showError({ title: 'Import failed', description: getErrorMessage(error) })
        return
      }

      showSuccess({ title: 'Workflow imported', description: `Successfully imported "${data.name}"` })
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
            <input id="import-file" type="file" accept=".json" onChange={handleFileChange} />
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

          <FormGroup label="Project" fieldId="import-project">
            <Controller
              name="projectId"
              control={control}
              render={({ field }) => (
                <FormSelect
                  id="import-project"
                  value={field.value ?? ''}
                  onChange={(_event, value) => field.onChange(value)}
                  aria-label="Select project"
                >
                  <FormSelectOption value="" label="No project" />
                  {projects.map((p) => (
                    <FormSelectOption key={p.id} value={p.id ?? ''} label={p.name ?? ''} />
                  ))}
                </FormSelect>
              )}
            />
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
