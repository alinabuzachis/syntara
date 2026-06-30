import type { FilesAPI, IntegrationsAPI, ToolManagerAPI } from '@ansible/nexus-contracts'
import { IntegrationTypeEnum } from '@ansible/nexus-contracts'
import {
  Button,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Stack,
  StackItem,
  TextArea,
} from '@patternfly/react-core'
import { RhUiErrorIcon } from '@patternfly/react-icons'
import type { ReactNode } from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Control, UseFormSetValue } from 'react-hook-form'
import { Controller, FormProvider, useForm, useFormContext, useFormState, useWatch } from 'react-hook-form'

import { integrationsClient, toolManagerClient } from '../../../client'
import { FILE_STORAGE_UNCONFIGURED_MESSAGE, useFileStorageStatus } from '../../../hooks/useFileStorageStatus'
import { type FileProgress, useFileUploadWithProgress } from '../../../hooks/useFileUploadWithProgress'
import { detachPromise } from '../../../utils/detachPromise'
import { generateUUID } from '../../../utils/generateUUID'
import { CredentialSelector } from '../components/CredentialSelector'
import { ExpandableCodeEditor } from '../components/ExpandableCodeEditor'
import { FileUpload, type UploadedFile } from '../components/file-upload'
import { DroppableField } from '../panels/fields/DroppableField'
import { useIsVersionView } from '../VersionViewContext'

import { aiAgentFormSchema, type AIAgentFormData } from './aiAgentFormSchema'
import { ConnectionsSection } from './ConnectionsSection'
import { credentialHelpText } from './credentialSelectorHelpText'
import { ActivityNameField } from './shared/ActivityNameField'
import { zodResolver } from './shared/formSchemaUtils'
import { NodeFormContainer } from './shared/NodeFormContainer'
import nodeFormStyles from './shared/nodeFormStyles.module.css'
import { NodeFormTabsLayout } from './shared/NodeFormTabsLayout'
import { NodeSettingsForm } from './shared/NodeSettingsForm'
import type { IntegrationWithTools, ToolSelection } from './ToolsMultiSelect'
import { ToolsMultiSelect } from './ToolsMultiSelect'

type FileUploadInfo = FilesAPI.components['schemas']['FileUploadInfo']
type IntegrationRead = IntegrationsAPI.components['schemas']['IntegrationRead']
type ToolWithParameters = ToolManagerAPI.components['schemas']['ToolWithParameters']

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
  initialData?: AIAgentFormInitialData
  onHeaderContentChange?: (content: ReactNode | null) => void
  projectId?: string
}

function mergeWithUploadProgress(
  completedFiles: UploadedFile[],
  uploadingFiles: UploadedFile[],
  progress: FileProgress[],
  error: { message: string } | null
): UploadedFile[] {
  return [
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
}

/** Group flat tool list by integration_id, filtering out disabled tools. */
function groupToolsByIntegration(tools: ToolWithParameters[], integrations: IntegrationRead[]): IntegrationWithTools[] {
  const integrationMap = new Map(
    integrations.filter((i): i is IntegrationRead & { id: string } => Boolean(i.id)).map((i) => [i.id, i.name])
  )

  const grouped = new Map<string, { name: string; tools: { id: string; name: string; description: string | null }[] }>()
  for (const tool of tools) {
    const integrationId = tool.integration_id
    if (!integrationId) continue
    if (!integrationMap.has(integrationId)) continue
    if (tool.enabled === false) continue
    if (!tool.id) continue
    if (!grouped.has(integrationId)) {
      grouped.set(integrationId, {
        name: integrationMap.get(integrationId) ?? integrationId,
        tools: [],
      })
    }
    const entry = grouped.get(integrationId)
    entry?.tools.push({
      id: tool.id,
      name: tool.namespaced_name,
      description: null,
    })
  }

  return Array.from(grouped.entries()).map(([id, { name, tools: discovered_tools }]) => ({
    id,
    name,
    discovered_tools,
  }))
}

function useToolSelection(control: Control<AIAgentFormData>, setValue: UseFormSetValue<AIAgentFormData>) {
  const toolSelectionStrategy = useWatch({ control, name: 'tool_selection_strategy' }) ?? 'NONE'
  const rawToolSelections = useWatch({ control, name: 'tool_selections' })

  const toolSelection = useMemo<ToolSelection>(() => {
    const toolSelections = rawToolSelections ?? []
    if (toolSelectionStrategy === 'ALL') return { strategy: 'ALL' }
    if (toolSelectionStrategy === 'SELECTED' && toolSelections.length > 0)
      return { strategy: 'SELECTED', toolIds: toolSelections }
    return { strategy: 'NONE' }
  }, [toolSelectionStrategy, rawToolSelections])

  const handleToolSelectionChange = useCallback(
    (selection: ToolSelection) => {
      if (selection.strategy === 'ALL') {
        setValue('tool_selection_strategy', 'ALL')
        setValue('tool_selections', [])
      } else if (selection.strategy === 'SELECTED') {
        setValue('tool_selection_strategy', 'SELECTED')
        setValue('tool_selections', selection.toolIds)
      } else {
        setValue('tool_selection_strategy', 'NONE')
        setValue('tool_selections', [])
        setValue('integration_connections', [])
      }
    },
    [setValue]
  )

  return { toolSelection, handleToolSelectionChange }
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

function ToolsLoadError({ onRetry }: Readonly<{ onRetry: () => void }>) {
  return (
    <FormHelperText>
      <HelperText>
        <HelperTextItem variant="error" icon={<RhUiErrorIcon />}>
          Failed to load tools or integrations.{' '}
          <Button variant="link" isInline onClick={onRetry}>
            Retry
          </Button>
        </HelperTextItem>
      </HelperText>
    </FormHelperText>
  )
}

function AIAgentFormFields({
  onHeaderContentChange,
  projectId,
  integrations,
  isLoadingIntegrations,
  isToolsError,
  onRetryTools,
}: {
  onHeaderContentChange?: (content: ReactNode | null) => void
  projectId?: string
  integrations: IntegrationWithTools[]
  isLoadingIntegrations: boolean
  isToolsError: boolean
  onRetryTools: () => void
}) {
  const isVersionView = useIsVersionView()
  const { register, control, getValues, setValue } = useFormContext<AIAgentFormData>()
  const { errors } = useFormState({ control })
  const fileContext = useContext(FileContext)
  if (!fileContext) throw new Error('AIAgentFormFields must be used within FileContext.Provider')
  const { completedFiles, setCompletedFiles } = fileContext
  const [uploadingFiles, setUploadingFiles] = useState<UploadedFile[]>([])
  const { uploadFiles, progress, error } = useFileUploadWithProgress()
  const { isConfigured: isFileStorageConfigured } = useFileStorageStatus()

  const { toolSelection, handleToolSelectionChange } = useToolSelection(control, setValue)

  const uploadedFiles = mergeWithUploadProgress(completedFiles, uploadingFiles, progress, error)

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
      if (!projectId) {
        throw new Error('Cannot upload files without a project context')
      }
      const response = await uploadFiles(files, projectId)

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
              isDisabled={isVersionView}
              isRequired
              errorMessage={errors.credential_id?.message}
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
          <ToolsMultiSelect
            value={toolSelection}
            onChange={handleToolSelectionChange}
            integrations={integrations}
            isLoading={isLoadingIntegrations}
          />
          {isToolsError && <ToolsLoadError onRetry={onRetryTools} />}
        </FormGroup>
      </StackItem>
      <StackItem>
        <Controller
          control={control}
          name="integration_connections"
          render={({ field }) => (
            <ConnectionsSection
              integrations={integrations}
              toolSelection={toolSelection}
              integrationConnections={field.value}
              onConnectionChange={field.onChange}
            />
          )}
        />
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

  // Track only newly uploaded files (existing files handled by parent)
  const [completedFiles, setCompletedFiles] = useState<UploadedFile[]>([])

  const {
    data: toolsData,
    isPending: isLoadingTools,
    isError: isToolsError,
    refetch: refetchTools,
  } = toolManagerClient.useQuery('get', '/tool_manager/tools')

  const {
    data: integrationsData,
    isError: isIntegrationsError,
    refetch: refetchIntegrations,
  } = integrationsClient.useQuery('get', '/integrations', {
    params: { query: { integration_type: IntegrationTypeEnum.MCP_SERVER, enabled: true } },
  })

  const isLoadingIntegrations = isLoadingTools
  const isAnyToolsError = isToolsError || isIntegrationsError
  const handleRetryTools = () => {
    detachPromise(refetchTools())
    detachPromise(refetchIntegrations())
  }

  const integrations = useMemo<IntegrationWithTools[]>(
    () =>
      groupToolsByIntegration((toolsData?.resources ?? []) as ToolWithParameters[], integrationsData?.resources ?? []),
    [toolsData, integrationsData]
  )

  const defaultValues: AIAgentFormData = {
    name: '',
    model: defaultModel,
    prompt: '',
    tool_selection_strategy: 'NONE',
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

  const fileContextValue = useMemo(() => ({ completedFiles, setCompletedFiles }), [completedFiles, setCompletedFiles])

  return (
    <FileContext.Provider value={fileContextValue}>
      <FormProvider {...methods}>
        <NodeFormContainer formId="ai-agent-node-form" onSubmit={methods.handleSubmit(handleSubmit)}>
          <AIAgentFormFields
            onHeaderContentChange={props.onHeaderContentChange}
            projectId={props.projectId}
            integrations={integrations}
            isLoadingIntegrations={isLoadingIntegrations}
            isToolsError={isAnyToolsError}
            onRetryTools={handleRetryTools}
          />
        </NodeFormContainer>
      </FormProvider>
    </FileContext.Provider>
  )
}
