import { FormGroup, FormHelperText, HelperText, HelperTextItem, Stack, StackItem } from '@patternfly/react-core'
import type { ReactNode } from 'react'
import { useEffect, useMemo } from 'react'
import { Controller, FormProvider, useForm, useFormContext } from 'react-hook-form'

import { ExpressionBuilderCore as ExpressionBuilder } from '../../../components/expressions/ExpressionBuilderCore'

import { ActivityNameField } from './shared/ActivityNameField'
import { ConditionalExpressionHelp } from './shared/ConditionalExpressionHelp'
import { conditionValidationRules } from './shared/conditionValidation'
import { NodeFormContainer } from './shared/NodeFormContainer'
import { NodeFormTabsLayout } from './shared/NodeFormTabsLayout'

export interface ConditionFormData {
  name: string
  condition: string
}

interface ConditionNodeFormProps {
  onSubmit: (data: ConditionFormData) => void
  submitButtonText?: string
  initialData?: Partial<ConditionFormData>
  onHeaderContentChange?: (content: ReactNode | null) => void
}

function ConditionFormFields({
  submitButtonText,
  onHeaderContentChange,
}: {
  submitButtonText?: string
  onHeaderContentChange?: (content: ReactNode | null) => void
}) {
  const { register, control } = useFormContext<ConditionFormData>()

  const nameField = useMemo(
    () => <ActivityNameField register={register} fieldId="condition-name" ariaLabel="Name" />,
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
      {!onHeaderContentChange && <ActivityNameField register={register} fieldId="condition-name" />}

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
          fieldId="condition-expression"
        >
          <Controller
            control={control}
            name="condition"
            rules={conditionValidationRules}
            render={({ field, fieldState }) => (
              <>
                <ExpressionBuilder
                  id="condition-expression"
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
    </Stack>
  )

  return <NodeFormTabsLayout parametersContent={parametersContent} submitButtonText={submitButtonText} />
}

export function ConditionNodeForm(props: ConditionNodeFormProps) {
  const defaultValues: ConditionFormData = {
    name: '',
    condition: '',
    ...props.initialData,
  }

  const methods = useForm<ConditionFormData>({ defaultValues })

  return (
    <FormProvider {...methods}>
      <NodeFormContainer formId="condition-node-form" onSubmit={methods.handleSubmit(props.onSubmit)}>
        <ConditionFormFields
          submitButtonText={props.submitButtonText}
          onHeaderContentChange={props.onHeaderContentChange}
        />
      </NodeFormContainer>
    </FormProvider>
  )
}
