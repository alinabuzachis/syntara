import type { FilesAPI } from '@ansible/nexus-contracts'
import { FormGroup, FormSelect, FormSelectOption, Stack, StackItem, TextArea } from '@patternfly/react-core'
import type { ReactNode } from 'react'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Controller, FormProvider, useForm, useFormContext } from 'react-hook-form'

import { FileUpload, type UploadedFile } from '../../../components/file-upload'
import { useFileUploadWithProgress } from '../../../hooks/useFileUploadWithProgress'
import { generateUUID } from '../../../utils/generateUUID'

import { ActivityNameField } from './shared/ActivityNameField'
import { NodeFormContainer } from './shared/NodeFormContainer'
import { NodeFormTabsLayout } from './shared/NodeFormTabsLayout'

type FileUploadInfo = FilesAPI.components['schemas']['FileUploadInfo']

export interface AIAgentFormData {
  name: string
  model: string
  prompt: string
  tools: string
}

/** Submitted data includes file IDs from uploads */
export interface AIAgentFormSubmitData extends AIAgentFormData {
  fileIds: string[]
}

/** Initial data for form fields (file IDs handled separately by parent) */
export type AIAgentFormInitialData = Partial<AIAgentFormData>

/** Context to share file state between form components */
interface FileContextType {
  completedFiles: UploadedFile[]
  setCompletedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>
}
const FileContext = createContext<FileContextType | null>(null)

interface AIAgentNodeFormProps {
  onSubmit: (data: AIAgentFormSubmitData) => void
  onCancel: () => void
  submitButtonText?: string
  initialData?: AIAgentFormInitialData
  onHeaderContentChange?: (content: ReactNode | null) => void
}

function AIAgentFormFields({
  submitButtonText,
  onHeaderContentChange,
}: {
  submitButtonText?: string
  onHeaderContentChange?: (content: ReactNode | null) => void
}) {
  const { register, control } = useFormContext<AIAgentFormData>()
  const fileContext = useContext(FileContext)
  if (!fileContext) throw new Error('AIAgentFormFields must be used within FileContext.Provider')
  const { completedFiles, setCompletedFiles } = fileContext
  const [uploadingFiles, setUploadingFiles] = useState<UploadedFile[]>([])
  const { uploadFiles, progress, error } = useFileUploadWithProgress()

  // Derive final uploadedFiles by merging completed files with current upload progress
  const uploadedFiles: UploadedFile[] = [
    ...completedFiles,
    ...uploadingFiles.map((f) => {
      const fileProgress = progress.find((p) => p.fileName === f.file.name)
      return {
        ...f,
        progress: fileProgress?.percentage ?? f.progress,
        status: error ? ('error' as const) : f.status,
        errorMessage: error?.message ?? f.errorMessage,
      }
    }),
  ]

  const handleFilesSelected = async (files: File[]) => {
    const reUploadNames = files.map((f) => f.name)

    // Create file entries with uploading status
    const newFiles: UploadedFile[] = files.map((file) => ({
      id: generateUUID(),
      file,
      progress: 0,
      status: 'uploading' as const,
    }))

    // Remove any existing files with same name from completed, add new files to uploading
    setCompletedFiles((prev) => prev.filter((f) => !reUploadNames.includes(f.file.name)))
    setUploadingFiles(newFiles)

    try {
      const response = await uploadFiles(files)

      // Move files to completed with success status and server-assigned IDs
      const successFiles = newFiles.map((f) => {
        const serverFile = response.files?.find(
          (sf: FileUploadInfo) => sf.filename === f.file.name && sf.size_bytes === f.file.size
        )
        return {
          ...f,
          id: serverFile?.file_id || f.id,
          progress: 100,
          status: 'success' as const,
        }
      })
      setCompletedFiles((prev) => [...prev, ...successFiles])
      setUploadingFiles([])
    } catch (err) {
      // Move files to completed with error status
      const errorMessage = err instanceof Error ? err.message : 'Upload failed'
      const errorFiles = newFiles.map((f) => ({
        ...f,
        status: 'error' as const,
        errorMessage,
      }))
      setCompletedFiles((prev) => [...prev, ...errorFiles])
      setUploadingFiles([])
    }
  }

  const handleFileRemove = (fileId: string) => {
    setCompletedFiles((prev) => prev.filter((f) => f.id !== fileId))
    setUploadingFiles((prev) => prev.filter((f) => f.id !== fileId))
  }

  const nameField = useMemo(
    () => (
      <ActivityNameField register={register} fieldId="agent-name" placeholder="Enter agent name" ariaLabel="Name" />
    ),
    [register]
  )

  useEffect(() => {
    onHeaderContentChange?.(nameField)
    return () => {
      onHeaderContentChange?.(null)
    }
  }, [nameField, onHeaderContentChange])

  const parametersContent = (
    <Stack hasGutter>
      <StackItem>
        <FormGroup label="Prompt" fieldId="agent-prompt" isRequired>
          <TextArea
            {...register('prompt', { required: true })}
            id="agent-prompt"
            placeholder="Natural language instructions for the agent..."
            rows={3}
          />
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Tools" fieldId="agent-tools">
          <Controller
            control={control}
            name="tools"
            defaultValue=""
            render={({ field }) => (
              <FormSelect
                id="agent-tools"
                aria-label="Tools"
                value={field.value}
                onChange={(_event, value) => field.onChange(value)}
                isDisabled
              >
                <FormSelectOption value="" label="All tools selected" />
              </FormSelect>
            )}
          />
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Context file upload" fieldId="agent-context">
          <FileUpload
            files={uploadedFiles}
            onFilesSelected={handleFilesSelected}
            onFileRemove={handleFileRemove}
            acceptedMimeTypes={['.pdf', '.doc', '.docx', '.txt', '.md']}
            aria-label="Context file upload"
          />
        </FormGroup>
      </StackItem>
    </Stack>
  )

  return <NodeFormTabsLayout parametersContent={parametersContent} submitButtonText={submitButtonText} />
}

export function AIAgentNodeForm(props: AIAgentNodeFormProps) {
  const defaultModel = import.meta.env.VITE_NEXUS_OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet'

  // Track only newly uploaded files (existing files handled by parent)
  const [completedFiles, setCompletedFiles] = useState<UploadedFile[]>([])

  const defaultValues: AIAgentFormData = {
    name: '',
    model: defaultModel,
    prompt: '',
    tools: '',
    ...props.initialData,
  }

  const handleSubmit = (data: AIAgentFormData) => {
    // Extract file IDs from completed uploads
    const fileIds: string[] = completedFiles.filter((f) => f.status === 'success').map((f) => f.id)

    props.onSubmit({ ...data, fileIds })
  }

  const methods = useForm<AIAgentFormData>({
    defaultValues,
  })

  return (
    <FileContext.Provider value={{ completedFiles, setCompletedFiles }}>
      <FormProvider {...methods}>
        <NodeFormContainer formId="ai-agent-node-form" onSubmit={methods.handleSubmit(handleSubmit)}>
          <AIAgentFormFields
            submitButtonText={props.submitButtonText}
            onHeaderContentChange={props.onHeaderContentChange}
          />
        </NodeFormContainer>
      </FormProvider>
    </FileContext.Provider>
  )
}
