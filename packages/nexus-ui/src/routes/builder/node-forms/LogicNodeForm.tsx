import { ActivityTypeEnum } from '@ansible/nexus-contracts'
import {
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  Stack,
  StackItem,
  Switch,
  TextInput,
} from '@patternfly/react-core'
import { RhUiErrorIcon } from '@patternfly/react-icons'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Controller, FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form'

import { ExpressionBuilderCore as ExpressionBuilder } from '../../../components/expressions/ExpressionBuilderCore'

import { timeUnitsToSeconds } from '../utils/timeUtils'

import {
  ActivityNameField,
  ConditionalExpressionHelp,
  conditionValidationRules,
  NodeFormContainer,
  NodeFormTabsLayout,
} from './shared'

/** Converge strategy: when to continue after branches */
export type ConvergeStrategy = 'all' | 'any'

/** Behavior of remaining nodes when strategy is 'any' */
export type RemainingBehavior = 'continue' | 'cancel'

export interface LogicFormData {
  name: string
  logicType: string
  condition?: string
  type?: string
  items?: string
  maxIterations?: number
  indexVariable?: string
  itemVariable?: string
  /** Computed total timeout in seconds (output only — derived from the unit fields below) */
  timeout?: number
  /** Whether the timeout toggle is enabled */
  timeoutEnabled?: boolean
  timeoutSeconds?: number
  timeoutMinutes?: number
  timeoutHours?: number
  timeoutDays?: number
  onTimeout?: 'continue' | 'fail'
  /** Continue when criteria - which branches must reach the converge node */
  strategy?: ConvergeStrategy
  /** Required path count when strategy is 'any' */
  requiredPathCount?: number
  /** Behavior of remaining nodes when strategy is 'any' */
  remainingBehavior?: RemainingBehavior
}

/** Options for "Continue when criteria" dropdown */
const CONTINUE_WHEN_CRITERIA_OPTIONS: Array<{ label: string; value: ConvergeStrategy; disabled?: boolean }> = [
  { label: 'All branches reach this node', value: 'all' },
  { label: 'Any branches reach this node (not yet implemented)', value: 'any', disabled: true },
]

/** Options for "Behavior of remaining nodes" when strategy is 'any' */
const REMAINING_BEHAVIOR_OPTIONS: Array<{ label: string; value: 'continue' | 'cancel' }> = [
  { label: 'Continue running', value: 'continue' },
  { label: 'Cancel node runs from remaining paths', value: 'cancel' },
]

/** Options for "Timeout action" dropdown */
const TIMEOUT_ACTION_OPTIONS: Array<{ label: string; value: 'fail' | 'continue'; description: string }> = [
  {
    value: 'fail',
    label: 'Fail',
    description:
      'The automation will fail if the parameters set on this converge node are not met by the specified timeout time.',
  },
  {
    value: 'continue',
    label: 'Continue with partial data',
    description: 'The automation will continue ignoring the parameters set for this converge node.',
  },
]

interface LogicNodeFormProps {
  onSubmit: (data: LogicFormData) => void
  submitButtonText?: string
  initialData?: Partial<LogicFormData>
  onHeaderContentChange?: (content: ReactNode | null) => void
}

function LogicFormFields({
  submitButtonText,
  onHeaderContentChange,
}: {
  submitButtonText?: string
  onHeaderContentChange?: (content: ReactNode | null) => void
}) {
  const {
    register,
    control,
    setValue,
    formState: { errors },
  } = useFormContext<LogicFormData>()
  const logicType = useWatch({ control, name: 'logicType' })
  const type = useWatch({ control, name: 'type' })
  const strategy = useWatch({ control, name: 'strategy' })
  const timeoutEnabled = useWatch({ control, name: 'timeoutEnabled' })
  const [isTimeoutActionOpen, setIsTimeoutActionOpen] = useState(false)

  const nameField = useMemo(
    () => <ActivityNameField register={register} fieldId="logic-name" ariaLabel="Name" />,
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
      {!onHeaderContentChange && <ActivityNameField register={register} fieldId="logic-name" />}
      <input type="hidden" {...register('logicType')} />

      {logicType === ActivityTypeEnum.CONDITION && (
        <StackItem>
          <FormGroup
            label={
              <span
                style={{
                  marginLeft: 'var(--pf-t--global--spacer--sm)',
                  marginRight: 'var(--pf-t--global--spacer--sm)',
                  display: 'inline-block',
                }}
              >
                Conditional expression <ConditionalExpressionHelp />
              </span>
            }
            isRequired
            fieldId="logic-condition"
          >
            <Controller
              control={control}
              name="condition"
              rules={conditionValidationRules}
              render={({ field, fieldState }) => (
                <>
                  <ExpressionBuilder
                    id="logic-condition"
                    value={field.value || ''}
                    onChange={field.onChange}
                    error={!!fieldState.error}
                    placeholder="Build your condition"
                  />
                  {fieldState.error && (
                    <FormHelperText>
                      <HelperText>
                        <HelperTextItem variant="error">{fieldState.error.message}</HelperTextItem>
                      </HelperText>
                    </FormHelperText>
                  )}
                </>
              )}
            />
          </FormGroup>
        </StackItem>
      )}

      {logicType === ActivityTypeEnum.LOOP && (
        <>
          <StackItem>
            <FormGroup label="Type" fieldId="logic-type">
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <FormSelect
                    id="logic-type"
                    aria-label="Type"
                    value={field.value}
                    onChange={(_event, value) => field.onChange(value)}
                  >
                    <FormSelectOption value="forEach" label="For each" />
                    <FormSelectOption value="while" label="While" />
                  </FormSelect>
                )}
              />
            </FormGroup>
          </StackItem>

          {type === 'forEach' && (
            <>
              <StackItem>
                <FormGroup label="Items expression" isRequired fieldId="logic-items">
                  <TextInput
                    {...register('items', { required: true })}
                    id="logic-items"
                    placeholder="${input.item_list}"
                    style={{ fontFamily: 'monospace' }}
                    type="text"
                  />
                </FormGroup>
              </StackItem>

              <StackItem>
                <FormGroup label="Item variable" fieldId="logic-itemVariable">
                  <TextInput
                    {...register('itemVariable')}
                    id="logic-itemVariable"
                    placeholder="item"
                    style={{ fontFamily: 'monospace' }}
                    type="text"
                  />
                </FormGroup>
              </StackItem>

              <StackItem>
                <FormGroup label="Index variable" fieldId="logic-indexVariable">
                  <TextInput
                    {...register('indexVariable')}
                    id="logic-indexVariable"
                    placeholder="index"
                    style={{ fontFamily: 'monospace' }}
                    type="text"
                  />
                </FormGroup>
              </StackItem>
            </>
          )}

          {type === 'while' && (
            <>
              <StackItem>
                <FormGroup
                  label={
                    <span>
                      Conditional expression <ConditionalExpressionHelp />
                    </span>
                  }
                  isRequired
                  fieldId="logic-condition-while"
                >
                  <Controller
                    control={control}
                    name="condition"
                    rules={conditionValidationRules}
                    render={({ field, fieldState }) => (
                      <>
                        <ExpressionBuilder
                          id="logic-condition-while"
                          value={field.value || ''}
                          onChange={field.onChange}
                          error={!!fieldState.error}
                          placeholder="Build your condition"
                        />
                        {fieldState.error && (
                          <FormHelperText>
                            <HelperText>
                              <HelperTextItem variant="error">{fieldState.error.message}</HelperTextItem>
                            </HelperText>
                          </FormHelperText>
                        )}
                      </>
                    )}
                  />
                </FormGroup>
              </StackItem>

              <StackItem>
                <FormGroup label="Max iterations" fieldId="logic-maxIterations">
                  <TextInput
                    {...register('maxIterations', { valueAsNumber: true })}
                    id="logic-maxIterations"
                    type="number"
                    min={1}
                    placeholder="1000 (default)"
                  />
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem>Maximum iterations to prevent infinite loops (default: 1000)</HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                </FormGroup>
              </StackItem>
            </>
          )}
        </>
      )}

      {logicType === ActivityTypeEnum.CONVERGE && (
        <>
          <StackItem>
            <FormGroup label="Continue when criteria" isRequired fieldId="logic-strategy">
              <Controller
                control={control}
                name="strategy"
                rules={{ required: 'Continue when criteria is required' }}
                render={({ field }) => (
                  <FormSelect
                    id="logic-strategy"
                    aria-label="Continue when criteria"
                    value={field.value ?? ''}
                    onChange={(_event, value) => field.onChange(value)}
                    isRequired
                  >
                    <FormSelectOption value="" label="Select continue when criteria" isPlaceholder />
                    {CONTINUE_WHEN_CRITERIA_OPTIONS.map((option) => (
                      <FormSelectOption
                        key={option.value}
                        value={option.value}
                        label={option.label}
                        isDisabled={option.disabled}
                      />
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
            <>
              <StackItem>
                <FormGroup label="Required path count" isRequired fieldId="logic-requiredPathCount">
                  <TextInput
                    {...register('requiredPathCount', {
                      required: strategy === 'any' ? 'Required path count is required' : false,
                      min: { value: 1, message: 'Must be at least 1' },
                      valueAsNumber: true,
                    })}
                    id="logic-requiredPathCount"
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

              <StackItem>
                <FormGroup label="Behavior of remaining nodes" isRequired fieldId="logic-remainingBehavior">
                  <Controller
                    control={control}
                    name="remainingBehavior"
                    rules={{
                      required: strategy === 'any' ? 'Behavior of remaining nodes is required' : false,
                    }}
                    render={({ field }) => (
                      <FormSelect
                        id="logic-remainingBehavior"
                        aria-label="Behavior of remaining nodes"
                        value={field.value ?? ''}
                        onChange={(_event, value) => field.onChange(value)}
                        isRequired
                      >
                        <FormSelectOption value="" label="Select behavior of remaining nodes" isPlaceholder />
                        {REMAINING_BEHAVIOR_OPTIONS.map((option) => (
                          <FormSelectOption key={option.value} value={option.value} label={option.label} />
                        ))}
                      </FormSelect>
                    )}
                  />
                  {errors.remainingBehavior && (
                    <FormHelperText>
                      <HelperText>
                        <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                          {errors.remainingBehavior.message}
                        </HelperTextItem>
                      </HelperText>
                    </FormHelperText>
                  )}
                </FormGroup>
              </StackItem>
            </>
          )}

          <StackItem>
            <Switch
              id="logic-timeoutEnabled"
              label="Timeout"
              isChecked={timeoutEnabled ?? false}
              onChange={(_event, checked) => setValue('timeoutEnabled', checked)}
              aria-label="Timeout"
            />
          </StackItem>

          {timeoutEnabled && (
            <>
              <StackItem>
                <FormGroup label="Second(s)" fieldId="logic-timeout-seconds">
                  <TextInput
                    {...register('timeoutSeconds', { valueAsNumber: true })}
                    id="logic-timeout-seconds"
                    placeholder="Enter number of seconds"
                    type="number"
                    min={0}
                  />
                </FormGroup>
              </StackItem>

              <StackItem>
                <FormGroup label="Minute(s)" fieldId="logic-timeout-minutes">
                  <TextInput
                    {...register('timeoutMinutes', { valueAsNumber: true })}
                    id="logic-timeout-minutes"
                    placeholder="Enter number of minutes"
                    type="number"
                    min={0}
                  />
                </FormGroup>
              </StackItem>

              <StackItem>
                <FormGroup label="Hour(s)" fieldId="logic-timeout-hours">
                  <TextInput
                    {...register('timeoutHours', { valueAsNumber: true })}
                    id="logic-timeout-hours"
                    placeholder="Enter number of hours"
                    type="number"
                    min={0}
                  />
                </FormGroup>
              </StackItem>

              <StackItem>
                <FormGroup label="Day(s)" fieldId="logic-timeout-days">
                  <TextInput
                    {...register('timeoutDays', { valueAsNumber: true })}
                    id="logic-timeout-days"
                    placeholder="Enter number of days"
                    type="number"
                    min={0}
                  />
                </FormGroup>
              </StackItem>

              <StackItem>
                <FormGroup label="Timeout action" isRequired fieldId="logic-timeoutAction">
                  <Controller
                    control={control}
                    name="onTimeout"
                    rules={{ required: timeoutEnabled ? 'Timeout action is required' : false }}
                    render={({ field }) => (
                      <Select
                        id="logic-timeoutAction"
                        isOpen={isTimeoutActionOpen}
                        onOpenChange={setIsTimeoutActionOpen}
                        popperProps={{ minWidth: 'trigger', maxWidth: 'trigger' }}
                        onSelect={(_event, value) => {
                          field.onChange(value)
                          setIsTimeoutActionOpen(false)
                        }}
                        selected={field.value}
                        toggle={(toggleRef) => (
                          <MenuToggle
                            ref={toggleRef}
                            onClick={() => setIsTimeoutActionOpen(!isTimeoutActionOpen)}
                            isExpanded={isTimeoutActionOpen}
                            isFullWidth
                          >
                            {TIMEOUT_ACTION_OPTIONS.find((o) => o.value === field.value)?.label ??
                              'Select timeout action'}
                          </MenuToggle>
                        )}
                      >
                        <SelectList>
                          {TIMEOUT_ACTION_OPTIONS.map((option) => (
                            <SelectOption key={option.value} value={option.value} description={option.description}>
                              {option.label}
                            </SelectOption>
                          ))}
                        </SelectList>
                      </Select>
                    )}
                  />
                  {errors.onTimeout && (
                    <FormHelperText>
                      <HelperText>
                        <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                          {errors.onTimeout.message}
                        </HelperTextItem>
                      </HelperText>
                    </FormHelperText>
                  )}
                </FormGroup>
              </StackItem>
            </>
          )}
        </>
      )}
    </Stack>
  )

  return <NodeFormTabsLayout parametersContent={parametersContent} submitButtonText={submitButtonText} />
}

export function LogicNodeForm(props: LogicNodeFormProps) {
  const defaultValues: LogicFormData = {
    name: '',
    logicType: props.initialData?.logicType ?? ActivityTypeEnum.CONDITION,
    type: 'forEach',
    indexVariable: 'index',
    itemVariable: 'item',
    onTimeout: 'fail',
    requiredPathCount: 1,
    timeoutEnabled: false,
    ...props.initialData,
  }

  const handleSubmit = (data: LogicFormData) => {
    // Calculate timeout only if enabled, preserving 0 as valid timeout
    let timeout: number | undefined
    if (data.logicType === ActivityTypeEnum.CONVERGE && data.timeoutEnabled) {
      const calculatedTimeout = timeUnitsToSeconds(
        Number(data.timeoutSeconds) || 0,
        Number(data.timeoutMinutes) || 0,
        Number(data.timeoutHours) || 0,
        Number(data.timeoutDays) || 0
      )
      // timeUnitsToSeconds always returns a number (with default params), including 0
      timeout = calculatedTimeout
    }

    const cleanedData: LogicFormData = {
      name: data.name,
      logicType: data.logicType,
      condition:
        data.logicType === ActivityTypeEnum.CONDITION ||
        (data.logicType === ActivityTypeEnum.LOOP && data.type === 'while')
          ? data.condition
          : undefined,
      type: data.logicType === ActivityTypeEnum.LOOP ? data.type : undefined,
      items: data.logicType === ActivityTypeEnum.LOOP && data.type === 'forEach' ? data.items : undefined,
      maxIterations:
        data.logicType === ActivityTypeEnum.LOOP &&
        data.type === 'while' &&
        data.maxIterations &&
        !Number.isNaN(data.maxIterations)
          ? data.maxIterations
          : undefined,
      indexVariable:
        data.logicType === ActivityTypeEnum.LOOP && data.type === 'forEach' ? data.indexVariable : undefined,
      itemVariable: data.logicType === ActivityTypeEnum.LOOP && data.type === 'forEach' ? data.itemVariable : undefined,
      timeout,
      onTimeout: data.logicType === ActivityTypeEnum.CONVERGE && data.timeoutEnabled ? data.onTimeout : undefined,
      strategy: data.logicType === ActivityTypeEnum.CONVERGE ? data.strategy : undefined,
      requiredPathCount:
        data.logicType === ActivityTypeEnum.CONVERGE && data.strategy === 'any' ? data.requiredPathCount : undefined,
      remainingBehavior:
        data.logicType === ActivityTypeEnum.CONVERGE && data.strategy === 'any' ? data.remainingBehavior : undefined,
    }
    props.onSubmit(cleanedData)
  }

  const methods = useForm<LogicFormData>({
    defaultValues,
  })

  return (
    <FormProvider {...methods}>
      <NodeFormContainer formId="logic-node-form" onSubmit={methods.handleSubmit(handleSubmit)}>
        <LogicFormFields
          submitButtonText={props.submitButtonText}
          onHeaderContentChange={props.onHeaderContentChange}
        />
      </NodeFormContainer>
    </FormProvider>
  )
}
