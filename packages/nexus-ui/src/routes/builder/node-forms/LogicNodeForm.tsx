import { Form, Input, NativeSelect, Textarea, useFormContext, useWatch } from '@ansible/nexus-ui-framework'
import { Alert, AlertVariant, Button, FormGroup, Stack, StackItem } from '@patternfly/react-core'

interface LogicFormData {
  name: string
  logicType: string
  condition?: string
  type?: string
  items?: string
  maxIterations?: number
  indexVariable?: string
  itemVariable?: string
  timeout?: string
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
  const { register } = useFormContext<LogicFormData>()
  const logicType = useWatch({ name: 'logicType' })
  const type = useWatch({ name: 'type' })

  return (
    <Stack hasGutter>
      <StackItem>
        <FormGroup label="Activity Name" isRequired fieldId="logic-name">
          <Input {...register('name', { required: true })} id="logic-name" placeholder="Enter activity name" />
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Logic Type" fieldId="logic-logicType">
          <NativeSelect {...register('logicType')} id="logic-logicType">
            <option value="condition">Condition (If/Else)</option>
            <option value="loop">Loop</option>
            <option value="converge">Converge (Join)</option>
          </NativeSelect>
        </FormGroup>
      </StackItem>

      {logicType === 'condition' && (
        <StackItem>
          <FormGroup label="Condition Expression" isRequired fieldId="logic-condition">
            <Textarea
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
              <NativeSelect {...register('type')} id="logic-type">
                <option value="forEach">For Each</option>
                <option value="while">While</option>
              </NativeSelect>
            </FormGroup>
          </StackItem>

          {type === 'forEach' && (
            <>
              <StackItem>
                <FormGroup label="Items Expression" isRequired fieldId="logic-items">
                  <Input
                    {...register('items', { required: true })}
                    id="logic-items"
                    placeholder="${input.item_list}"
                    style={{ fontFamily: 'monospace' }}
                  />
                </FormGroup>
              </StackItem>

              <StackItem>
                <FormGroup label="Item Variable" fieldId="logic-itemVariable">
                  <Input
                    {...register('itemVariable')}
                    id="logic-itemVariable"
                    placeholder="item"
                    style={{ fontFamily: 'monospace' }}
                  />
                </FormGroup>
              </StackItem>

              <StackItem>
                <FormGroup label="Index Variable" fieldId="logic-indexVariable">
                  <Input
                    {...register('indexVariable')}
                    id="logic-indexVariable"
                    placeholder="index"
                    style={{ fontFamily: 'monospace' }}
                  />
                </FormGroup>
              </StackItem>
            </>
          )}

          {type === 'while' && (
            <>
              <StackItem>
                <FormGroup label="Condition Expression" isRequired fieldId="logic-condition-while">
                  <Textarea
                    {...register('condition', { required: true })}
                    id="logic-condition-while"
                    placeholder="${counter < 10}"
                    rows={2}
                    style={{ fontFamily: 'monospace' }}
                  />
                </FormGroup>
              </StackItem>

              <StackItem>
                <FormGroup
                  label="Max Iterations"
                  fieldId="logic-maxIterations"
                  helperText="Maximum iterations to prevent infinite loops (default: 1000)"
                >
                  <Input
                    {...register('maxIterations', { valueAsNumber: true })}
                    id="logic-maxIterations"
                    type="number"
                    min={1}
                    placeholder="1000 (default)"
                  />
                </FormGroup>
              </StackItem>
            </>
          )}
        </>
      )}

      {logicType === 'converge' && (
        <>
          <StackItem>
            <FormGroup
              label="Timeout (ISO 8601 Duration)"
              fieldId="logic-timeout"
              helperText="Maximum time to wait for all branches (e.g., PT5M, PT1H, P1D)"
            >
              <Input
                {...register('timeout')}
                id="logic-timeout"
                placeholder="PT5M (5 minutes)"
                style={{ fontFamily: 'monospace' }}
              />
            </FormGroup>
          </StackItem>

          <StackItem>
            <FormGroup label="On Timeout" fieldId="logic-onTimeout">
              <NativeSelect {...register('onTimeout')} id="logic-onTimeout">
                <option value="fail">Fail - Stop workflow</option>
                <option value="continue">Continue - Proceed anyway</option>
              </NativeSelect>
            </FormGroup>
          </StackItem>

          <StackItem>
            <FormGroup label="Aggregate Outputs" fieldId="logic-aggregateOutputs">
              <NativeSelect {...register('aggregateOutputs')} id="logic-aggregateOutputs">
                <option value="true">Yes - Collect outputs from all branches</option>
                <option value="false">No - Don't aggregate outputs</option>
              </NativeSelect>
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

      <StackItem>
        <Button type="submit" variant="primary" style={{ width: '100%' }}>
          {submitButtonText ?? 'Add node'}
        </Button>
      </StackItem>
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

  return (
    <Form<LogicFormData> id="logic-node-form" defaultValues={defaultValues} onSubmit={handleSubmit}>
      {() => <LogicFormFields submitButtonText={props.submitButtonText} />}
    </Form>
  )
}
