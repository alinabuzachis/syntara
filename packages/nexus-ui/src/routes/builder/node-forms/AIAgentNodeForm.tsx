import type { FilesAPI } from '@ansible/nexus-contracts'
import {
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Stack,
  StackItem,
  TextArea,
} from '@patternfly/react-core'
import { RhUiErrorIcon } from '@patternfly/react-icons'
import type { ReactNode } from 'react'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Controller, FormProvider, useForm, useFormContext, useFormState } from 'react-hook-form'

import { CredentialSelector } from '../../../components/CredentialSelector'
import { credentialHelpText } from '../../../components/credentialSelectorHelpText'
import { ExpandableCodeEditor } from '../../../components/ExpandableCodeEditor'
import { FileUpload, type UploadedFile } from '../../../components/file-upload'
import { useFileUploadWithProgress } from '../../../hooks/useFileUploadWithProgress'
import { generateUUID } from '../../../utils/generateUUID'
import { DroppableField } from '../panels/fields/DroppableField'

import { aiAgentFormSchema, type AIAgentFormData } from './aiAgentFormSchema'
import { ActivityNameField } from './shared/ActivityNameField'
import { zodResolver } from './shared/formSchemaUtils'
import { NodeFormContainer } from './shared/NodeFormContainer'
import { NodeFormTabsLayout } from './shared/NodeFormTabsLayout'

type FileUploadInfo = FilesAPI.components['schemas']['FileUploadInfo']

export type { AIAgentFormData }

/** Submitted data includes file IDs from uploads and parsed response schema */
export type AIAgentFormSubmitData = {
  fileIds: string[]
  parsedResponseSchema?: Record<string, unknown>
} & AIAgentFormData

/** Initial data for form fields (file IDs handled separately by parent) */
export type AIAgentFormInitialData = Partial<AIAgentFormData>

/** Context to share file state between form components */
type FileContextType = {
  completedFiles: UploadedFile[]
  setCompletedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>
}
const FileContext = createContext<FileContextType | null>(null)

export type AIAgentNodeFormProps = {
  onSubmit: (data: AIAgentFormSubmitData) => void
  submitButtonText?: string
  initialData?: AIAgentFormInitialData
  onHeaderContentChange?: (content: ReactNode | null) => void
  projectId?: string
}

function AIAgentFormFields({
  submitButtonText,
  onHeaderContentChange,
  projectId,
}: {
  submitButtonText?: string
  onHeaderContentChange?: (content: ReactNode | null) => void
  projectId?: string
}) {
  const { register, control, getValues, setValue } = useFormContext<AIAgentFormData>()
  const { errors } = useFormState({ control })
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
    const reUploadNames = new Set(files.map((f) => f.name))

    // Create file entries with uploading status
    const newFiles: UploadedFile[] = files.map((file) => ({
      id: generateUUID(),
      file,
      progress: 0,
      status: 'uploading' as const,
    }))

    // Remove any existing files with same name from completed, add new files to uploading
    setCompletedFiles((prev) => prev.filter((f) => !reUploadNames.has(f.file.name)))
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
          id: serverFile?.file_id ?? f.id,
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
        <Controller
          control={control}
          name="credential_id"
          render={({ field }) => (
            <CredentialSelector
              value={field.value ?? undefined}
              onChange={field.onChange}
              compatibleTypeNames={['LLM Provider']}
              label="LLM provider credential"
              fieldId="agent-credential"
              placeholder="Select LLM credential"
              allowCreate
              projectId={projectId}
              helpText={credentialHelpText(
                'Select a stored credential for the LLM provider. Credentials securely store API keys and authentication tokens.'
              )}
            />
          )}
        />
      </StackItem>
      <StackItem>
        <FormGroup label="Prompt" fieldId="agent-prompt" isRequired>
          <DroppableField
            onDropText={(text) => {
              const current = getValues('prompt')
              setValue('prompt', (current ?? '') + text)
            }}
          >
            <TextArea
              {...register('prompt')}
              id="agent-prompt"
              placeholder="Natural language instructions for the agent..."
              rows={3}
              validated={errors.prompt ? 'error' : 'default'}
            />
          </DroppableField>
          {errors.prompt && (
            <FormHelperText>
              <HelperText>
                <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                  {errors.prompt.message}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          )}
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
        <FormGroup label="Response schema" fieldId="agent-response-schema">
          <Controller
            control={control}
            name="responseSchema"
            render={({ field }) => (
              <ExpandableCodeEditor
                code={field.value ?? ''}
                onCodeChange={field.onChange}
                language="json"
                height="150px"
                modalTitle="Edit response schema"
                ariaLabel="Response schema editor"
              />
            )}
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Optional JSON Schema to enforce structured output format.</HelperTextItem>
            </HelperText>
          </FormHelperText>
          {errors.responseSchema && (
            <FormHelperText>
              <HelperText>
                <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                  {errors.responseSchema.message}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          )}
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

export function AIAgentNodeForm(props: Readonly<AIAgentNodeFormProps>) {
  const envModel: string | undefined = import.meta.env.VITE_NEXUS_OPENROUTER_MODEL as string | undefined
  const defaultModel = envModel || 'anthropic/claude-haiku-4.5'

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
    // Parse response schema (already validated by Zod superRefine)
    const trimmed = data.responseSchema?.trim()
    const parsedResponseSchema = trimmed ? (JSON.parse(trimmed) as Record<string, unknown>) : undefined

    const fileIds: string[] = completedFiles.filter((f) => f.status === 'success').map((f) => f.id)

    props.onSubmit({ ...data, fileIds, parsedResponseSchema })
  }

  const methods = useForm<AIAgentFormData>({
    resolver: zodResolver(aiAgentFormSchema, undefined, { mode: 'sync' }),
    defaultValues,
    mode: 'onChange',
    reValidateMode: 'onChange',
  })

  const fileContextValue = useMemo(() => ({ completedFiles, setCompletedFiles }), [completedFiles, setCompletedFiles])

  return (
    <FileContext.Provider value={fileContextValue}>
      <FormProvider {...methods}>
        <NodeFormContainer formId="ai-agent-node-form" onSubmit={methods.handleSubmit(handleSubmit)}>
          <AIAgentFormFields
            submitButtonText={props.submitButtonText}
            onHeaderContentChange={props.onHeaderContentChange}
            projectId={props.projectId}
          />
        </NodeFormContainer>
      </FormProvider>
    </FileContext.Provider>
  )
}
