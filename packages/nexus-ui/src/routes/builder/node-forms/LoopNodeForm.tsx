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
import { useEffect, useMemo } from 'react'
import { Controller, FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form'

import { ExpressionBuilderCore as ExpressionBuilder } from '../../../components/expressions/ExpressionBuilderCore'

import { ActivityNameField } from './shared/ActivityNameField'
import { BehaviorHelp } from './shared/BehaviorHelp'
import { ConditionalExpressionHelp } from './shared/ConditionalExpressionHelp'
import { conditionValidationRules } from './shared/conditionValidation'
import { LoopTypeHelp } from './shared/LoopTypeHelp'
import { MaxIterationsHelp } from './shared/MaxIterationsHelp'
import { NodeFormContainer } from './shared/NodeFormContainer'
import { NodeFormTabsLayout } from './shared/NodeFormTabsLayout'

export interface LoopFormData {
  name: string
  type: 'forEach' | 'while'
  items?: string
  indexVariable?: string
  itemVariable?: string
  condition?: string
  maxIterations?: number
  maxIterationsBehavior?: 'continue' | 'fail'
}

interface LoopNodeFormProps {
  onSubmit: (data: LoopFormData) => void
  submitButtonText?: string
  initialData?: Partial<LoopFormData>
  onHeaderContentChange?: (content: ReactNode | null) => void
}

function LoopFormFields({
  submitButtonText,
  onHeaderContentChange,
}: {
  submitButtonText?: string
  onHeaderContentChange?: (content: ReactNode | null) => void
}) {
  const { register, control } = useFormContext<LoopFormData>()
  const type = useWatch({ control, name: 'type' })

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
                {...register('items', { required: true })}
                id="loop-items"
                placeholder="${input.item_list}"
                style={{ fontFamily: 'monospace' }}
                type="text"
              />
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
              />
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
                render={({ field, fieldState }) => (
                  <>
                    <ExpressionBuilder
                      id="loop-condition-while"
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

  const methods = useForm<LoopFormData>({ defaultValues })

  return (
    <FormProvider {...methods}>
      <NodeFormContainer formId="loop-node-form" onSubmit={methods.handleSubmit(handleSubmit)}>
        <LoopFormFields submitButtonText={props.submitButtonText} onHeaderContentChange={props.onHeaderContentChange} />
      </NodeFormContainer>
    </FormProvider>
  )
}
