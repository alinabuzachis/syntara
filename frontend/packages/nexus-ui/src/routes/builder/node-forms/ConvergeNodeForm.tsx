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
import { RhUiErrorIcon } from '@patternfly/react-icons'
import type { ReactNode } from 'react'
import { useEffect, useMemo } from 'react'
import { Controller, FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form'

import { useWorkflowEngineDefaults } from '../hooks/useWorkflowEngineDefaults'
import { formatDuration } from '../utils/timeUtils'

import { convergeFormSchema, type ConvergeFormData, type ConvergeStrategy } from './convergeFormSchema'
import { ActivityNameField } from './shared/ActivityNameField'
import { ContinueWhenCriteriaHelp } from './shared/ContinueWhenCriteriaHelp'
import { DurationInput } from './shared/DurationInput'
import { zodResolver } from './shared/formSchemaUtils'
import { NodeFormContainer } from './shared/NodeFormContainer'
import { NodeFormTabsLayout } from './shared/NodeFormTabsLayout'
import { NodeSettingsForm } from './shared/NodeSettingsForm'
import { RequiredBranchCountHelp } from './shared/RequiredBranchCountHelp'

export type { ConvergeFormData, ConvergeStrategy }

/** Options for "Continue when criteria" dropdown */
const CONTINUE_WHEN_CRITERIA_OPTIONS: Array<{ label: string; value: ConvergeStrategy }> = [
  { label: 'All branches reach this step', value: 'all' },
  { label: 'Any branches reach this step', value: 'any' },
]

type ConvergeNodeFormProps = {
  onSubmit: (data: ConvergeFormData) => void
  initialData?: Partial<ConvergeFormData>
  onHeaderContentChange?: (content: ReactNode | null) => void
}

function ConvergeFormFields({
  onHeaderContentChange,
  validationErrors,
}: {
  onHeaderContentChange?: (content: ReactNode | null) => void
  validationErrors?: {
    strategy?: { message?: string }
    requiredPathCount?: { message?: string }
  }
}) {
  const {
    register,
    control,
    setValue,
    formState: { errors: contextErrors },
  } = useFormContext<ConvergeFormData>()
  const errors = validationErrors ?? contextErrors
  const strategy = useWatch({ control, name: 'strategy' })
  const waitDuration = useWatch({ control, name: 'wait_duration' })
  const { defaults } = useWorkflowEngineDefaults()
  const convergeWaitDurationDefault = defaults?.convergeWaitDuration ?? null

  useEffect(() => {
    if (errors.strategy) document.getElementById('converge-strategy')?.focus()
  }, [errors.strategy])

  const nameField = useMemo(
    () => <ActivityNameField register={register} fieldId="converge-name" ariaLabel="Name" />,
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
      {!onHeaderContentChange && <ActivityNameField register={register} fieldId="converge-name" />}

      <StackItem>
        <FormGroup
          label="Continue when criteria"
          labelHelp={<ContinueWhenCriteriaHelp />}
          isRequired
          fieldId="converge-strategy"
        >
          <Controller
            control={control}
            name="strategy"
            render={({ field }) => (
              <FormSelect
                id="converge-strategy"
                aria-label="Continue when criteria"
                value={field.value ?? ''}
                onChange={(_event, value) => field.onChange(value)}
                isRequired
                validated={errors.strategy ? 'error' : 'default'}
              >
                <FormSelectOption value="" label="Select continue when criteria" isPlaceholder />
                {CONTINUE_WHEN_CRITERIA_OPTIONS.map((option) => (
                  <FormSelectOption key={option.value} value={option.value} label={option.label} />
                ))}
              </FormSelect>
            )}
          />
          {errors.strategy && (
            <FormHelperText>
              <HelperText>
                <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                  {errors.strategy.message}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          )}
        </FormGroup>
      </StackItem>

      {strategy === 'any' && (
        <StackItem>
          <FormGroup
            label="Required number of branches before continuing"
            labelHelp={<RequiredBranchCountHelp />}
            isRequired
            fieldId="converge-requiredPathCount"
          >
            <TextInput
              {...register('requiredPathCount', { valueAsNumber: true })}
              id="converge-requiredPathCount"
              type="number"
              min={1}
            />
            {errors.requiredPathCount && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                    {errors.requiredPathCount.message}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>
        </StackItem>
      )}

      <StackItem>
        <FormGroup label="Wait duration" fieldId="converge-wait-duration-days">
          <Stack hasGutter>
            <StackItem>
              <DurationInput
                value={waitDuration}
                onChange={(val) => setValue('wait_duration', val, { shouldDirty: true })}
                idPrefix="converge-wait-duration"
              />
            </StackItem>
            <StackItem>
              <HelperText>
                <HelperTextItem>
                  {convergeWaitDurationDefault !== null
                    ? `How long to wait for branches to arrive before timing out. Falls back to system default (${formatDuration(convergeWaitDurationDefault)}) if not set.`
                    : 'How long to wait for branches to arrive before timing out. Falls back to system default if not set.'}
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
      supportsRetryPolicy={false}
      continueOnFailureHelp={
        'When “Continue on failure” is selected and the wait duration expires before all required branches arrive, the workflow proceeds with whichever branches have completed. Incomplete branches are marked skipped.'
      }
    />
  )

  return <NodeFormTabsLayout parametersContent={parametersContent} settingsContent={settingsContent} />
}

export function ConvergeNodeForm(props: ConvergeNodeFormProps) {
  const defaultValues: ConvergeFormData = {
    name: '',
    strategy: 'all',
    requiredPathCount: 1,
    settings: {},
    ...props.initialData,
  }

  const handleSubmit = (data: ConvergeFormData) => {
    const cleanedData: ConvergeFormData = {
      name: data.name,
      strategy: data.strategy,
      wait_duration: data.wait_duration,
      settings: data.settings,
      requiredPathCount: data.strategy === 'any' ? data.requiredPathCount : undefined,
    }

    props.onSubmit(cleanedData)
  }

  const methods = useForm<ConvergeFormData>({
    resolver: zodResolver(convergeFormSchema, undefined, { mode: 'sync' }),
    defaultValues,
  })

  const {
    formState: { errors },
  } = methods

  return (
    <FormProvider {...methods}>
      <NodeFormContainer formId="converge-node-form" onSubmit={methods.handleSubmit(handleSubmit)}>
        <ConvergeFormFields onHeaderContentChange={props.onHeaderContentChange} validationErrors={errors} />
      </NodeFormContainer>
    </FormProvider>
  )
}
