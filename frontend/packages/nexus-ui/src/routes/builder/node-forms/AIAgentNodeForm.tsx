import {
  Alert,
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
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Controller, FormProvider, useForm, useFormContext, useFormState } from 'react-hook-form'

import { FILE_STORAGE_UNCONFIGURED_MESSAGE, useFileStorageStatus } from '../../../hooks/useFileStorageStatus'
import { useFileUploadWithProgress } from '../../../hooks/useFileUploadWithProgress'
import { generateUUID } from '../../../utils/generateUUID'
import { CredentialSelector } from '../components/CredentialSelector'
import { ExpandableCodeEditor } from '../components/ExpandableCodeEditor'
import { FileUpload, type UploadedFile } from '../components/file-upload'
import { DroppableField } from '../panels/fields/DroppableField'
import { useIsVersionView } from '../VersionViewContext'

import { aiAgentFormSchema, type AIAgentFormData } from './aiAgentFormSchema'
import { credentialHelpText } from './credentialSelectorHelpText'
import { ActivityNameField } from './shared/ActivityNameField'
import { zodResolver } from './shared/formSchemaUtils'
import { NodeFormContainer } from './shared/NodeFormContainer'
import nodeFormStyles from './shared/nodeFormStyles.module.css'
import { NodeFormTabsLayout } from './shared/NodeFormTabsLayout'
import { NodeSettingsForm } from './shared/NodeSettingsForm'
import { useFilesMetadata } from './useFilesMetadata'

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
  addFiles: (files: UploadedFile[]) => void
  removeFile: (fileId: string) => void
  removeFilesByName: (names: Set<string>) => void
  isFilesError: boolean
}
const FileContext = createContext<FileContextType | null>(null)

export type AIAgentNodeFormProps = {
  onSubmit: (data: AIAgentFormSubmitData) => void
  initialData?: AIAgentFormInitialData
  existingFileIds?: string[]
  onHeaderContentChange?: (content: ReactNode | null) => void
  projectId?: string
}

function FieldError({ message }: Readonly<{ message: string | undefined }>) {
  if (!message) return null
  return (
    <FormHelperText>
      <HelperText>
        <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
          {message}
        </HelperTextItem>
      </HelperText>
    </FormHelperText>
  )
}

type AIAgentFormFieldsProps = Readonly<{
  onHeaderContentChange?: (content: ReactNode | null) => void
  projectId?: string
}>

function AIAgentFormFields({ onHeaderContentChange, projectId }: AIAgentFormFieldsProps) {
  const isVersionView = useIsVersionView()
  const { register, control, getValues, setValue } = useFormContext<AIAgentFormData>()
  const { errors } = useFormState({ control })
  const fileContext = useContext(FileContext)
  if (!fileContext) throw new Error('AIAgentFormFields must be used within FileContext.Provider')
  const { completedFiles, addFiles, removeFile, removeFilesByName, isFilesError } = fileContext
  const [uploadingFiles, setUploadingFiles] = useState<UploadedFile[]>([])
  const { uploadFiles, progress, error } = useFileUploadWithProgress()
  const { isConfigured: isFileStorageConfigured } = useFileStorageStatus()

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
    removeFilesByName(reUploadNames)
    setUploadingFiles(newFiles)

    try {
      if (!projectId) {
        throw new Error('Cannot upload files without a project context')
      }
      const response = await uploadFiles(files, projectId)

      // Move files to completed with success status and server-assigned IDs.
      // Match by index: server returns files in upload order.
      // Filename matching is unreliable because the backend sanitizes filenames
      // (e.g. "Pack Pal - My list.pdf" → "PackPal-Mylist.pdf").
      const successFiles = newFiles.map((f, i) => ({
        ...f,
        id: response.files?.[i]?.file_id ?? f.id,
        progress: 100,
        status: 'success' as const,
      }))
      addFiles(successFiles)
      setUploadingFiles([])
    } catch (err) {
      // Move files to completed with error status
      const errorMessage = err instanceof Error ? err.message : 'Upload failed'
      const errorFiles = newFiles.map((f) => ({
        ...f,
        status: 'error' as const,
        errorMessage,
      }))
      addFiles(errorFiles)
      setUploadingFiles([])
    }
  }

  const handleFileRemove = (fileId: string) => {
    removeFile(fileId)
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
              isDisabled={isVersionView}
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
              isDisabled={isVersionView}
            />
          </DroppableField>
          <FieldError message={errors.prompt?.message} />
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Tools" fieldId="agent-tools">
          <Controller
            control={control}
            name="tool_selection_strategy"
            render={({ field }) => (
              <FormSelect
                id="agent-tools"
                aria-label="Tools"
                value={field.value}
                onChange={(_event, value) => field.onChange(value)}
                isDisabled
              >
                <FormSelectOption value="ALL" label="All tools selected" />
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
                isReadOnly={isVersionView}
              />
            )}
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Optional JSON Schema to enforce structured output format.</HelperTextItem>
            </HelperText>
          </FormHelperText>
          <FieldError message={errors.responseSchema?.message} />
        </FormGroup>
      </StackItem>
      {isFilesError && (
        <StackItem>
          <Alert
            variant="warning"
            isInline
            isPlain
            title="Previously attached files could not be loaded. They will be removed if you save."
          />
        </StackItem>
      )}
      <StackItem>
        <FormGroup label="Context file upload" fieldId="agent-context">
          <fieldset disabled={isVersionView} className={nodeFormStyles.disabledFieldset}>
            <FileUpload
              files={uploadedFiles}
              onFilesSelected={handleFilesSelected}
              onFileRemove={handleFileRemove}
              acceptedMimeTypes={['.pdf', '.doc', '.docx', '.txt', '.md']}
              aria-label="Context file upload"
              disabled={!isFileStorageConfigured}
              disabledTooltip={FILE_STORAGE_UNCONFIGURED_MESSAGE}
            />
          </fieldset>
        </FormGroup>
      </StackItem>
    </Stack>
  )

  const settingsContent = <NodeSettingsForm timeoutNodeType="agentic" />

  return <NodeFormTabsLayout parametersContent={parametersContent} settingsContent={settingsContent} />
}

export function AIAgentNodeForm(props: Readonly<AIAgentNodeFormProps>) {
  const envModel: string | undefined = import.meta.env.VITE_NEXUS_OPENROUTER_MODEL as string | undefined
  const defaultModel = envModel || 'anthropic/claude-haiku-4.5'

  const { data: hydratedFiles, isError: isFilesError } = useFilesMetadata(props.existingFileIds)
  const [userFiles, setUserFiles] = useState<UploadedFile[]>([])
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())

  const completedFiles = useMemo(() => {
    const userIds = new Set(userFiles.map((f) => f.id))
    const visibleHydrated = hydratedFiles.filter((f) => !removedIds.has(f.id) && !userIds.has(f.id))
    return [...visibleHydrated, ...userFiles]
  }, [hydratedFiles, userFiles, removedIds])

  const addFiles = useCallback((files: UploadedFile[]) => {
    setUserFiles((prev) => [...prev, ...files])
  }, [])

  const removeFile = useCallback((fileId: string) => {
    setUserFiles((prev) => prev.filter((f) => f.id !== fileId))
    setRemovedIds((prev) => new Set(prev).add(fileId))
  }, [])

  const removeFilesByName = useCallback(
    (names: Set<string>) => {
      setUserFiles((prev) => prev.filter((f) => !names.has(f.file.name)))
      setRemovedIds((prev) => {
        const next = new Set(prev)
        for (const f of hydratedFiles) {
          if (names.has(f.file.name)) next.add(f.id)
        }
        return next
      })
    },
    [hydratedFiles]
  )

  const defaultValues: AIAgentFormData = {
    name: '',
    model: defaultModel,
    prompt: '',
    tool_selection_strategy: 'ALL',
    tool_selections: [],
    integration_connections: [],
    credential_id: '',
    settings: {},
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

  const fileContextValue = useMemo(
    () => ({
      completedFiles,
      addFiles,
      removeFile,
      removeFilesByName,
      isFilesError: isFilesError && !!props.existingFileIds?.length,
    }),
    [completedFiles, addFiles, removeFile, removeFilesByName, isFilesError, props.existingFileIds]
  )

  return (
    <FileContext.Provider value={fileContextValue}>
      <FormProvider {...methods}>
        <NodeFormContainer formId="ai-agent-node-form" onSubmit={methods.handleSubmit(handleSubmit)}>
          <AIAgentFormFields onHeaderContentChange={props.onHeaderContentChange} projectId={props.projectId} />
        </NodeFormContainer>
      </FormProvider>
    </FileContext.Provider>
  )
}
