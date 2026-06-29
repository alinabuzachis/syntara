import { TriggerTypeEnum, WEBHOOK_TRIGGER_TYPES } from '@ansible/nexus-contracts'
import {
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Controller, FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form'

import { DateRangeCadencePicker } from '../../../components/forms/DateRangeCadencePicker'
import { generateWebhookPath } from '../../../utils/webhookPath'
import { useIsVersionView } from '../VersionViewContext'

import { EdaFields } from './EdaTriggerFields'
import { ManualTriggerFields } from './ManualTriggerFields'
import { ActivityNameField } from './shared/ActivityNameField'
import { zodResolver } from './shared/formSchemaUtils'
import { NodeFormContainer } from './shared/NodeFormContainer'
import nodeFormStyles from './shared/nodeFormStyles.module.css'
import { NodeFormTabsLayout } from './shared/NodeFormTabsLayout'
import { normalizeWebhookPath, triggerFormSchema, type TriggerFormData } from './triggerFormSchema'
import { WebhookFields } from './WebhookTriggerFields'

export type { TriggerFormData }

type TriggerNodeFormProps = {
  onSubmit: (data: TriggerFormData) => void
  initialData?: Partial<TriggerFormData>
  onHeaderContentChange?: (content: ReactNode | null) => void
}

function TriggerFormFields({
  onHeaderContentChange,
  validationErrors,
}: {
  onHeaderContentChange?: (content: ReactNode | null) => void
  validationErrors?: {
    interval?: { message?: string }
    cron?: { message?: string }
    inputSchema?: { message?: string }
    webhookPath?: { message?: string }
  }
}) {
  const isVersionView = useIsVersionView()
  const {
    control,
    register,
    formState: { errors: contextErrors },
  } = useFormContext<TriggerFormData>()
  const errors = validationErrors ?? contextErrors
  const triggerType = useWatch({ control, name: 'triggerType' })
  const scheduleType = useWatch({ control, name: 'scheduleType' })

  useEffect(() => {
    if (errors.interval) document.getElementById('cadence-start')?.focus()
  }, [errors.interval])

  useEffect(() => {
    if (errors.cron) document.getElementById('cron-expression')?.focus()
  }, [errors.cron])

  const nameField = useMemo(
    () => (
      <ActivityNameField<TriggerFormData>
        register={register}
        fieldId="trigger-name"
        placeholder="Enter trigger name"
        ariaLabel="Name"
      />
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
      <input type="hidden" {...register('triggerType')} />

      {triggerType === TriggerTypeEnum.MANUAL_TRIGGER && (
        <fieldset disabled={isVersionView} className={nodeFormStyles.disabledFieldset}>
          <ManualTriggerFields errors={errors} />
        </fieldset>
      )}

      {triggerType === TriggerTypeEnum.SCHEDULED && (
        <>
          <StackItem>
            <FormGroup label="Schedule type" fieldId="schedule-type">
              <Controller
                control={control}
                name="scheduleType"
                render={({ field }) => (
                  <FormSelect
                    id="schedule-type"
                    aria-label="Schedule type"
                    value={field.value}
                    onChange={(_event, value) => field.onChange(value)}
                    isDisabled={isVersionView}
                  >
                    <FormSelectOption value="interval" label="Interval" />
                    <FormSelectOption value="cron" label="Cron" />
                  </FormSelect>
                )}
              />
            </FormGroup>
          </StackItem>

          {scheduleType === 'interval' && (
            <StackItem>
              <fieldset disabled={isVersionView} className={nodeFormStyles.disabledFieldset}>
                <Controller
                  control={control}
                  name="interval"
                  render={({ field }) => (
                    <DateRangeCadencePicker
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      required
                      showTime
                      error={!!errors.interval}
                      errorMessage={errors.interval?.message}
                    />
                  )}
                />
              </fieldset>
            </StackItem>
          )}

          {scheduleType === 'cron' && (
            <StackItem>
              <FormGroup label="Cron expression" fieldId="cron-expression" isRequired>
                <Controller
                  control={control}
                  name="cron"
                  render={({ field }) => (
                    <TextInput
                      id="cron-expression"
                      aria-label="Cron expression"
                      value={field.value ?? ''}
                      onChange={(_event, value) => field.onChange(value)}
                      placeholder="0 9 * * *"
                      validated={errors.cron ? 'error' : 'default'}
                    />
                  )}
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant={errors.cron ? 'error' : 'default'}>
                      {errors.cron?.message ?? 'Standard 5-field format: minute hour day-of-month month day-of-week'}
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>
            </StackItem>
          )}
        </>
      )}

      {triggerType === TriggerTypeEnum.WEBHOOK_TRIGGER && (
        <fieldset disabled={isVersionView} className={nodeFormStyles.disabledFieldset}>
          <WebhookFields errors={errors} />
        </fieldset>
      )}

      {triggerType === TriggerTypeEnum.EDA_TRIGGER && (
        <fieldset disabled={isVersionView} className={nodeFormStyles.disabledFieldset}>
          <EdaFields errors={errors} />
        </fieldset>
      )}
    </Stack>
  )

  return <NodeFormTabsLayout parametersContent={parametersContent} hideSettingsTab />
}

export function TriggerNodeForm(props: TriggerNodeFormProps) {
  const [defaultValues] = useState<TriggerFormData>(() => {
    const values: TriggerFormData = {
      name: '',
      triggerType: props.initialData?.triggerType ?? TriggerTypeEnum.MANUAL_TRIGGER,
      scheduleType: 'interval',
      interval: '',
      cron: '',
      inputSchema: '',
      webhookPath: '',
      ...props.initialData,
    }

    if (WEBHOOK_TRIGGER_TYPES.has(values.triggerType) && !values.webhookPath) {
      values.webhookPath = generateWebhookPath()
    }

    return values
  })

  const methods = useForm<TriggerFormData>({
    resolver: zodResolver(triggerFormSchema, undefined, { mode: 'sync' }),
    defaultValues,
  })

  const {
    formState: { errors },
  } = methods

  const handleSubmit = (data: TriggerFormData) => {
    const isManual = data.triggerType === TriggerTypeEnum.MANUAL_TRIGGER
    const isScheduled = data.triggerType === TriggerTypeEnum.SCHEDULED
    const isWebhookStyle = WEBHOOK_TRIGGER_TYPES.has(data.triggerType)

    const cleanedData: TriggerFormData = {
      name: data.name,
      triggerType: data.triggerType,
      inputSchema: isManual || isWebhookStyle ? data.inputSchema : undefined,
      scheduleType: isScheduled ? data.scheduleType : undefined,
      interval: isScheduled && data.scheduleType === 'interval' ? data.interval : undefined,
      cron: isScheduled && data.scheduleType === 'cron' ? data.cron : undefined,
      webhookPath: isWebhookStyle ? normalizeWebhookPath(data.webhookPath ?? '') : undefined,
    }
    props.onSubmit(cleanedData)
  }

  return (
    <FormProvider {...methods}>
      <NodeFormContainer formId="trigger-node-form" onSubmit={methods.handleSubmit(handleSubmit)}>
        <TriggerFormFields onHeaderContentChange={props.onHeaderContentChange} validationErrors={errors} />
      </NodeFormContainer>
    </FormProvider>
  )
}
