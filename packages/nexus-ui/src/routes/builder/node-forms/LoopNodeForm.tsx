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
import { ConditionalExpressionHelp } from './shared/ConditionalExpressionHelp'
import { conditionValidationRules } from './shared/conditionValidation'
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
        <FormGroup label="Type" fieldId="loop-type">
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

          <StackItem>
            <FormGroup label="Max iterations" fieldId="loop-maxIterations">
              <TextInput
                {...register('maxIterations', { valueAsNumber: true })}
                id="loop-maxIterations"
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
    </Stack>
  )

  return <NodeFormTabsLayout parametersContent={parametersContent} submitButtonText={submitButtonText} />
}

export function LoopNodeForm(props: LoopNodeFormProps) {
  const defaultValues: LoopFormData = {
    name: '',
    type: 'forEach',
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
        maxIterations: data.maxIterations && !Number.isNaN(data.maxIterations) ? data.maxIterations : undefined,
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
