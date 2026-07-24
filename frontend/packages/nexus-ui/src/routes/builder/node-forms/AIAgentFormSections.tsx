import { Button, FormGroup, FormHelperText, HelperText, HelperTextItem, StackItem } from '@patternfly/react-core'
import { RhUiErrorIcon } from '@patternfly/react-icons'
import { useFormContext, useWatch } from 'react-hook-form'

import { LLMCredentialStatus } from '../components/LLMCredentialStatus'
import { LLMModelSelector, type LLMModelSelection } from '../components/LLMModelSelector'

import type { AIAgentFormData } from './aiAgentFormSchema'
import { nodeHelp } from './shared/nodeFieldHelp'
import { AI_MODEL_HELP } from './shared/nodeFieldHelpText'

export function ToolsLoadError({ onRetry }: Readonly<{ onRetry: () => void }>) {
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

type LLMSectionProps = Readonly<{ isVersionView: boolean; projectId?: string }>

export function LLMSection({ isVersionView, projectId }: LLMSectionProps) {
  const { control, setValue } = useFormContext<AIAgentFormData>()

  // useWatch fires synchronously in the same render as setValue — avoids the stale
  // closure bug that Controller's render prop had when llm_model_id and credential_id
  // were updated in the same event handler.
  const [watchedLlmModelId, watchedCredentialId] = useWatch({
    control,
    name: ['llm_model_id', 'credential_id'],
  })

  const selection: LLMModelSelection | undefined = watchedLlmModelId ? { llm_model_id: watchedLlmModelId } : undefined

  return (
    <>
      <StackItem>
        <LLMModelSelector
          value={selection}
          onChange={(newSelection) => {
            setValue('llm_model_id', newSelection?.llm_model_id ?? '', { shouldDirty: true })
            if (!newSelection) setValue('credential_id', undefined, { shouldDirty: true })
          }}
          isDisabled={isVersionView}
          projectId={projectId}
          helpText={AI_MODEL_HELP}
        />
      </StackItem>
      <StackItem>
        <FormGroup label="Credential" labelHelp={nodeHelp.aiCredential} fieldId="agent-credential">
          <LLMCredentialStatus
            modelSelected={!!watchedLlmModelId}
            credentialId={watchedCredentialId}
            onChange={(credentialId) => setValue('credential_id', credentialId, { shouldDirty: true })}
            isDisabled={isVersionView}
            projectId={projectId}
          />
        </FormGroup>
      </StackItem>
    </>
  )
}

export const NO_PROJECT_MESSAGE = 'Select a project in the workflow builder header to upload context files.'
