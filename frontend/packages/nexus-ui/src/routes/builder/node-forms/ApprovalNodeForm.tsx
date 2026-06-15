import type { NodeSettings } from '@ansible/nexus-contracts'
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
import { useEffect, useMemo } from 'react'
import { Controller, FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form'

import { TagInput } from '../../../components/forms/TagInput'
import { useWorkflowEngineDefaults } from '../hooks/useWorkflowEngineDefaults'
import { formatDuration } from '../utils/timeUtils'

import { approvalFormSchema, type ApprovalFormData } from './approvalFormSchema'
import { ActivityNameField } from './shared/ActivityNameField'
import { DurationInput } from './shared/DurationInput'
import { zodResolver } from './shared/formSchemaUtils'
import { NodeFormContainer } from './shared/NodeFormContainer'
import { NodeFormTabsLayout } from './shared/NodeFormTabsLayout'
import { NodeSettingsForm } from './shared/NodeSettingsForm'

export type ApprovalFormSubmitData = {
  name: string
  approvers: string[]
  prompt: string
  fallback_decision?: 'approve' | 'reject'
  /** How long (in seconds) the approver has to respond. Stored in config.decision_window. */
  decision_window?: number
  settings?: NodeSettings
  metadata?: {
    [key: string]: unknown
  }
  outputs?: {
    approved?: boolean
    approver?: string
    timestamp?: string
    comments?: string
  }
}

type ApprovalNodeFormProps = {
  onSubmit: (data: ApprovalFormSubmitData) => void
  initialData?: Partial<ApprovalFormSubmitData>
  onHeaderContentChange?: (content: ReactNode | null) => void
}

function ApprovalFormFields({
  onHeaderContentChange,
  validationErrors,
}: {
  initialApprovers: string[]
  onHeaderContentChange?: (content: ReactNode | null) => void
  validationErrors?: { approvers?: { message?: string } }
}) {
  const { register, control, setValue } = useFormContext<ApprovalFormData>()
  const decisionWindow = useWatch({ control, name: 'decision_window' })
  const { defaults } = useWorkflowEngineDefaults()
  const approvalTimeoutDefault = defaults?.timeoutSeconds.approval ?? null

  const nameField = useMemo(
    () => <ActivityNameField register={register} fieldId="approval-name" ariaLabel="Name" />,
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
        <FormGroup label="Usernames to notify" isRequired fieldId="approval-approvers">
          <Controller
            name="approvers"
            control={control}
            rules={{ required: true }}
            render={({ field }) => {
              const approversList = field.value
                ? field.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                : []
              return (
                <>
                  <TagInput
                    id="approval-approvers-inline-input"
                    value={approversList}
                    onChange={(arr) => field.onChange(arr.join(', '))}
                    ariaLabel="Add approver"
                    placeholder="username1"
                    helperText={
                      validationErrors?.approvers ? undefined : 'Type a username and press Enter or comma to add'
                    }
                  />
                  {validationErrors?.approvers && (
                    <FormHelperText>
                      <HelperText>
                        <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                          {validationErrors.approvers.message}
                        </HelperTextItem>
                      </HelperText>
                    </FormHelperText>
                  )}
                </>
              )
            }}
          />
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Message" fieldId="approval-prompt">
          <TextArea
            {...register('prompt')}
            id="approval-prompt"
            placeholder="Please approve this deployment to production"
            rows={3}
          />
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Fallback decision" fieldId="approval-fallback-decision">
          <Controller
            control={control}
            name="fallback_decision"
            render={({ field }) => (
              <FormSelect
                id="approval-fallback-decision"
                aria-label="Fallback decision"
                value={field.value ?? 'reject'}
                onChange={(_event, value) => field.onChange(value)}
              >
                <FormSelectOption value="reject" label="Reject (default)" />
                <FormSelectOption value="approve" label="Approve" />
              </FormSelect>
            )}
          />
          <HelperText>
            <HelperTextItem>
              Determines the routing path when the approval cannot complete (decision window expired or send failure).
              Only takes effect when &ldquo;Continue on failure&rdquo; is enabled in the Settings tab.
            </HelperTextItem>
          </HelperText>
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Decision window" fieldId="approval-decision-window-days">
          <Stack hasGutter>
            <StackItem>
              <DurationInput
                value={decisionWindow}
                onChange={(val) => setValue('decision_window', val, { shouldDirty: true })}
                idPrefix="approval-decision-window"
              />
            </StackItem>
            <StackItem>
              <HelperText>
                <HelperTextItem>
                  {approvalTimeoutDefault !== null
                    ? `How long the approver has to respond before the request expires. Falls back to system default (${formatDuration(approvalTimeoutDefault)}) if not set.`
                    : 'How long the approver has to respond before the request expires. Falls back to system default if not set.'}
                </HelperTextItem>
              </HelperText>
            </StackItem>
          </Stack>
        </FormGroup>
      </StackItem>
    </Stack>
  )

  const settingsContent = (
    <NodeSettingsForm
      supportsTimeout={false}
      continueOnFailureHelp="When enabled and the approval cannot complete (decision window expired or send failure), the workflow proceeds. The outcome is determined by the fallback decision in the approval config."
    />
  )

  return <NodeFormTabsLayout parametersContent={parametersContent} settingsContent={settingsContent} />
}

export function ApprovalNodeForm(props: ApprovalNodeFormProps) {
  const initialApprovers = props.initialData?.approvers ?? []

  const defaultValues: ApprovalFormData = {
    name: props.initialData?.name ?? '',
    approvers: initialApprovers.join(', '),
    prompt: props.initialData?.prompt ?? '',
    fallback_decision: props.initialData?.fallback_decision ?? 'reject',
    decision_window: props.initialData?.decision_window,
    settings: props.initialData?.settings ?? {},
  }

  const handleSubmit = (data: ApprovalFormData) => {
    const approversList = data.approvers
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    props.onSubmit({
      name: data.name.trim(),
      approvers: approversList,
      prompt: data.prompt.trim(),
      fallback_decision: data.fallback_decision,
      decision_window: data.decision_window,
      settings: data.settings,
    })
  }

  const methods = useForm<ApprovalFormData>({
    resolver: zodResolver(approvalFormSchema, undefined, { mode: 'sync' }),
    defaultValues,
  })

  const {
    formState: { errors },
  } = methods

  return (
    <FormProvider {...methods}>
      <NodeFormContainer formId="approval-node-form" onSubmit={methods.handleSubmit(handleSubmit)}>
        <ApprovalFormFields
          initialApprovers={initialApprovers}
          onHeaderContentChange={props.onHeaderContentChange}
          validationErrors={errors}
        />
      </NodeFormContainer>
    </FormProvider>
  )
}
