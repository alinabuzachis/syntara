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

import { ExpressionBuilderCore as ExpressionBuilder } from '../../../components/expressions/ExpressionBuilderCore'

import { loopFormSchema, type LoopFormData } from './loopFormSchema'
import { ActivityNameField } from './shared/ActivityNameField'
import { BehaviorHelp } from './shared/BehaviorHelp'
import { ConditionalExpressionHelp } from './shared/ConditionalExpressionHelp'
import { conditionValidationRules } from './shared/conditionValidation'
import { zodResolver } from './shared/formSchemaUtils'
import { LoopTypeHelp } from './shared/LoopTypeHelp'
import { MaxIterationsHelp } from './shared/MaxIterationsHelp'
import { NodeFormContainer } from './shared/NodeFormContainer'
import { NodeFormTabsLayout } from './shared/NodeFormTabsLayout'

export type { LoopFormData }

type LoopNodeFormProps = {
  onSubmit: (data: LoopFormData) => void
  submitButtonText?: string
  initialData?: Partial<LoopFormData>
  onHeaderContentChange?: (content: ReactNode | null) => void
}

// eslint-disable-next-line max-lines-per-function
function LoopFormFields({
  submitButtonText,
  onHeaderContentChange,
  validationErrors,
}: {
  submitButtonText?: string
  onHeaderContentChange?: (content: ReactNode | null) => void
  validationErrors?: {
    items?: { message?: string }
    condition?: { message?: string }
    maxIterations?: { message?: string }
  }
}) {
  const {
    register,
    control,
    formState: { errors: contextErrors },
  } = useFormContext<LoopFormData>()
  const errors = validationErrors ?? contextErrors
  const type = useWatch({ control, name: 'type' })

  useEffect(() => {
    if (errors.items) document.getElementById('loop-items')?.focus()
    else if (errors.condition) document.getElementById('loop-condition-while')?.focus()
    else if (errors.maxIterations) document.getElementById('loop-maxIterations')?.focus()
  }, [errors.items, errors.condition, errors.maxIterations])

  const nameField = useMemo(
    () => <ActivityNameField register={register} fieldId="loop-name" ariaLabel="Name" />,
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
      {!onHeaderContentChange && <ActivityNameField register={register} fieldId="loop-name" />}

      <StackItem>
        <FormGroup
          label={
            <span>
              Type <LoopTypeHelp />
            </span>
          }
          fieldId="loop-type"
        >
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <FormSelect
                id="loop-type"
                aria-label="Type"
                value={field.value}
                onChange={(_event, value) => field.onChange(value)}
              >
                <FormSelectOption value="while" label="While" />
                <FormSelectOption value="forEach" label="For each" />
              </FormSelect>
            )}
          />
        </FormGroup>
      </StackItem>

      {type === 'forEach' && (
        <>
          <StackItem>
            <FormGroup label="Items expression" isRequired fieldId="loop-items">
              <TextInput
                {...register('items')}
                id="loop-items"
                placeholder="${input.item_list}"
                style={{ fontFamily: 'monospace' }}
                type="text"
                validated={errors.items ? 'error' : 'default'}
              />
              <FormHelperText>
                <HelperText>
                  {errors.items ? (
                    <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                      {errors.items.message}
                    </HelperTextItem>
                  ) : (
                    <HelperTextItem>Expression that evaluates to a list</HelperTextItem>
                  )}
                </HelperText>
              </FormHelperText>
            </FormGroup>
          </StackItem>

          <StackItem>
            <FormGroup label="Item variable" fieldId="loop-itemVariable">
              <TextInput
                {...register('itemVariable')}
                id="loop-itemVariable"
                placeholder="item"
                style={{ fontFamily: 'monospace' }}
                type="text"
              />
            </FormGroup>
          </StackItem>

          <StackItem>
            <FormGroup label="Index variable" fieldId="loop-indexVariable">
              <TextInput
                {...register('indexVariable')}
                id="loop-indexVariable"
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
                  Max iterations <MaxIterationsHelp />
                </span>
              }
              fieldId="loop-maxIterations"
            >
              <TextInput
                {...register('maxIterations', { valueAsNumber: true })}
                id="loop-maxIterations"
                type="number"
                min={1}
                step={1}
                placeholder="1000 (default)"
                style={{ width: '100%' }}
                validated={errors.maxIterations ? 'error' : 'default'}
              />
              {errors.maxIterations && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                      {errors.maxIterations.message}
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )}
            </FormGroup>
          </StackItem>

          <StackItem>
            <FormGroup
              label={
                <span>
                  Behaviour when max iteration is reached <BehaviorHelp />
                </span>
              }
              fieldId="loop-maxIterations-behavior"
            >
              <Controller
                control={control}
                name="maxIterationsBehavior"
                render={({ field }) => (
                  <FormSelect
                    id="loop-maxIterations-behavior"
                    aria-label="Behaviour when max iteration is reached"
                    value={field.value || 'continue'}
                    onChange={(_event, value) => field.onChange(value)}
                  >
                    <FormSelectOption value="continue" label="Continue to the done path" />
                    <FormSelectOption value="fail" label="Fail" />
                  </FormSelect>
                )}
              />
            </FormGroup>
          </StackItem>

          <StackItem>
            <FormGroup
              label={
                <span>
                  Conditional expression <ConditionalExpressionHelp />
                </span>
              }
              isRequired
              fieldId="loop-condition-while"
            >
              <Controller
                control={control}
                name="condition"
                rules={conditionValidationRules}
                render={({ field, fieldState }) => {
                  const conditionError = fieldState.error ?? errors.condition
                  return (
                    <>
                      <ExpressionBuilder
                        id="loop-condition-while"
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        error={!!conditionError}
                        placeholder="Build your condition"
                      />
                      <FormHelperText>
                        <HelperText>
                          {conditionError ? (
                            <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                              {conditionError.message}
                            </HelperTextItem>
                          ) : (
                            <HelperTextItem>
                              Build your condition using the visual builder or custom expression
                            </HelperTextItem>
                          )}
                        </HelperText>
                      </FormHelperText>
                    </>
                  )
                }}
              />
            </FormGroup>
          </StackItem>
        </>
      )}
    </Stack>
  )

  return <NodeFormTabsLayout parametersContent={parametersContent} submitButtonText={submitButtonText} />
}

export function LoopNodeForm(props: LoopNodeFormProps) {
  const defaultValues: LoopFormData = {
    name: '',
    type: 'while',
    maxIterationsBehavior: 'continue',
    indexVariable: 'index',
    itemVariable: 'item',
    ...props.initialData,
  }

  const handleSubmit = (data: LoopFormData) => {
    // Clean data: remove undefined fields based on type
    const cleanedData: LoopFormData = {
      name: data.name,
      type: data.type,
      ...(data.type === 'forEach' && {
        items: data.items,
        indexVariable: data.indexVariable,
        itemVariable: data.itemVariable,
      }),
      ...(data.type === 'while' && {
        condition: data.condition,
        maxIterations:
          typeof data.maxIterations === 'number' && Number.isInteger(data.maxIterations) && data.maxIterations > 0
            ? data.maxIterations
            : undefined,
        maxIterationsBehavior: data.maxIterationsBehavior || 'continue',
      }),
    }
    props.onSubmit(cleanedData)
  }

  const methods = useForm<LoopFormData>({
    resolver: zodResolver(loopFormSchema, undefined, { mode: 'sync' }),
    defaultValues,
  })

  const {
    formState: { errors },
  } = methods

  return (
    <FormProvider {...methods}>
      <NodeFormContainer formId="loop-node-form" onSubmit={methods.handleSubmit(handleSubmit)}>
        <LoopFormFields
          submitButtonText={props.submitButtonText}
          onHeaderContentChange={props.onHeaderContentChange}
          validationErrors={errors}
        />
      </NodeFormContainer>
    </FormProvider>
  )
}
