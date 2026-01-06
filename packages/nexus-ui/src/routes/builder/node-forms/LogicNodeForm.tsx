import {
  Alert,
  AlertVariant,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Stack,
  StackItem,
  TextArea,
  TextInput,
} from '@patternfly/react-core'
import { Controller, FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form'

import { ActivityNameField } from './shared/ActivityNameField'
import { FormSubmitButton } from './shared/FormSubmitButton'

interface LogicFormData {
  name: string
  logicType: string
  condition?: string
  type?: string
  items?: string
  maxIterations?: number
  indexVariable?: string
  itemVariable?: string
  timeout?: number
  onTimeout?: 'continue' | 'fail'
  aggregateOutputs?: boolean
}

interface LogicNodeFormProps {
  onSubmit: (data: LogicFormData) => void
  onCancel: () => void
  submitButtonText?: string
  initialData?: Partial<LogicFormData>
}

function LogicFormFields({ submitButtonText }: { submitButtonText?: string }) {
  const { register, control } = useFormContext<LogicFormData>()
  const logicType = useWatch({ control, name: 'logicType' })
  const type = useWatch({ control, name: 'type' })

  return (
    <Stack hasGutter>
      <ActivityNameField register={register} fieldId="logic-name" />
      <StackItem>
        <FormGroup label="Logic Type" fieldId="logic-logicType">
          <Controller
            control={control}
            name="logicType"
            render={({ field }) => (
              <FormSelect
                id="logic-logicType"
                aria-label="Logic Type"
                value={field.value}
                onChange={(_event, value) => field.onChange(value)}
              >
                <FormSelectOption value="condition" label="Condition (If/Else)" />
                <FormSelectOption value="loop" label="Loop" />
                <FormSelectOption value="converge" label="Converge (Join)" />
              </FormSelect>
            )}
          />
        </FormGroup>
      </StackItem>

      {logicType === 'condition' && (
        <StackItem>
          <FormGroup label="Condition Expression" isRequired fieldId="logic-condition">
            <TextArea
              {...register('condition', { required: true })}
              id="logic-condition"
              placeholder="${output.status == 'success'}"
              rows={2}
              style={{ fontFamily: 'monospace' }}
            />
          </FormGroup>
        </StackItem>
      )}

      {logicType === 'loop' && (
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
                    <FormSelectOption value="forEach" label="For Each" />
                    <FormSelectOption value="while" label="While" />
                  </FormSelect>
                )}
              />
            </FormGroup>
          </StackItem>

          {type === 'forEach' && (
            <>
              <StackItem>
                <FormGroup label="Items Expression" isRequired fieldId="logic-items">
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
                <FormGroup label="Item Variable" fieldId="logic-itemVariable">
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
                <FormGroup label="Index Variable" fieldId="logic-indexVariable">
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
                <FormGroup label="Condition Expression" isRequired fieldId="logic-condition-while">
                  <TextArea
                    {...register('condition', { required: true })}
                    id="logic-condition-while"
                    placeholder="${counter < 10}"
                    rows={2}
                    style={{ fontFamily: 'monospace' }}
                  />
                </FormGroup>
              </StackItem>

              <StackItem>
                <FormGroup label="Max Iterations" fieldId="logic-maxIterations">
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

      {logicType === 'converge' && (
        <>
          <StackItem>
            <FormGroup label="Timeout (seconds)" fieldId="logic-timeout">
              <TextInput
                {...register('timeout', { valueAsNumber: true })}
                id="logic-timeout"
                placeholder="300 (5 minutes)"
                type="number"
                min={1}
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>
                    Maximum time to wait for all branches in seconds (e.g., 300 = 5 min, 3600 = 1 hour)
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
          </StackItem>

          <StackItem>
            <FormGroup label="On Timeout" fieldId="logic-onTimeout">
              <Controller
                control={control}
                name="onTimeout"
                render={({ field }) => (
                  <FormSelect
                    id="logic-onTimeout"
                    aria-label="On Timeout"
                    value={field.value}
                    onChange={(_event, value) => field.onChange(value)}
                  >
                    <FormSelectOption value="fail" label="Fail - Stop workflow" />
                    <FormSelectOption value="continue" label="Continue - Proceed anyway" />
                  </FormSelect>
                )}
              />
            </FormGroup>
          </StackItem>

          <StackItem>
            <FormGroup label="Aggregate Outputs" fieldId="logic-aggregateOutputs">
              <Controller
                control={control}
                name="aggregateOutputs"
                render={({ field }) => (
                  <FormSelect
                    id="logic-aggregateOutputs"
                    aria-label="Aggregate Outputs"
                    value={String(field.value ?? true)}
                    onChange={(_event, value) => field.onChange(value === 'true')}
                  >
                    <FormSelectOption value="true" label="Yes - Collect outputs from all branches" />
                    <FormSelectOption value="false" label="No - Don't aggregate outputs" />
                  </FormSelect>
                )}
              />
            </FormGroup>
          </StackItem>

          <StackItem>
            <Alert variant={AlertVariant.info} title="Note">
              Converge nodes wait for all connected parallel branches to complete before proceeding. Connect incoming
              edges from the branches you want to synchronize.
            </Alert>
          </StackItem>
        </>
      )}

      <FormSubmitButton submitButtonText={submitButtonText} />
    </Stack>
  )
}

export function LogicNodeForm(props: LogicNodeFormProps) {
  const defaultValues: LogicFormData = {
    name: '',
    logicType: 'condition',
    type: 'forEach',
    indexVariable: 'index',
    itemVariable: 'item',
    onTimeout: 'fail',
    aggregateOutputs: true,
    ...props.initialData,
  }

  const handleSubmit = (data: LogicFormData) => {
    const cleanedData: LogicFormData = {
      name: data.name,
      logicType: data.logicType,
      condition:
        data.logicType === 'condition' || (data.logicType === 'loop' && data.type === 'while')
          ? data.condition
          : undefined,
      type: data.logicType === 'loop' ? data.type : undefined,
      items: data.logicType === 'loop' && data.type === 'forEach' ? data.items : undefined,
      maxIterations:
        data.logicType === 'loop' && data.type === 'while' && data.maxIterations && !Number.isNaN(data.maxIterations)
          ? data.maxIterations
          : undefined,
      indexVariable: data.logicType === 'loop' && data.type === 'forEach' ? data.indexVariable : undefined,
      itemVariable: data.logicType === 'loop' && data.type === 'forEach' ? data.itemVariable : undefined,
      timeout: data.logicType === 'converge' ? data.timeout : undefined,
      onTimeout: data.logicType === 'converge' ? data.onTimeout : undefined,
      aggregateOutputs: data.logicType === 'converge' ? data.aggregateOutputs : undefined,
    }
    props.onSubmit(cleanedData)
  }

  const methods = useForm<LogicFormData>({
    defaultValues,
  })

  return (
    <FormProvider {...methods}>
      <Form id="logic-node-form" onSubmit={methods.handleSubmit(handleSubmit)}>
        <LogicFormFields submitButtonText={props.submitButtonText} />
      </Form>
    </FormProvider>
  )
}
