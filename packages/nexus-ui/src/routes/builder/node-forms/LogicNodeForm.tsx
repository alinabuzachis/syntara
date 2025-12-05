import {
  Button,
  Card,
  Form,
  Input,
  NativeSelect,
  Textarea,
  useFormContext,
  useWatch,
} from '@ansible/nexus-ui-framework'

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
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="logic-name" className="text-xs font-medium text-gray-300">
          Activity Name <span className="text-red-500">*</span>
        </label>
        <Input
          {...register('name', { required: true })}
          id="logic-name"
          placeholder="Enter activity name"
          className="text-xs"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="logic-logicType" className="text-xs font-medium text-gray-300">
          Logic Type
        </label>
        <NativeSelect {...register('logicType')} id="logic-logicType">
          <option value="condition">Condition (If/Else)</option>
          <option value="loop">Loop</option>
          <option value="converge">Converge (Join)</option>
        </NativeSelect>
      </div>

      {logicType === 'condition' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="logic-condition" className="text-xs font-medium text-gray-300">
            Condition Expression <span className="text-red-500">*</span>
          </label>
          <Textarea
            {...register('condition', { required: true })}
            id="logic-condition"
            placeholder="${output.status == 'success'}"
            rows={2}
            className="font-mono text-xs"
          />
        </div>
      )}

      {logicType === 'loop' && (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="logic-type" className="text-xs font-medium text-gray-300">
              Type
            </label>
            <NativeSelect {...register('type')} id="logic-type">
              <option value="forEach">For Each</option>
              <option value="while">While</option>
            </NativeSelect>
          </div>

          {type === 'forEach' && (
            <>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="logic-items" className="text-xs font-medium text-gray-300">
                  Items Expression <span className="text-red-500">*</span>
                </label>
                <Input
                  {...register('items', { required: true })}
                  id="logic-items"
                  placeholder="${input.item_list}"
                  className="font-mono text-xs"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="logic-itemVariable" className="text-xs font-medium text-gray-300">
                  Item Variable
                </label>
                <Input
                  {...register('itemVariable')}
                  id="logic-itemVariable"
                  placeholder="item"
                  className="font-mono text-xs"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="logic-indexVariable" className="text-xs font-medium text-gray-300">
                  Index Variable
                </label>
                <Input
                  {...register('indexVariable')}
                  id="logic-indexVariable"
                  placeholder="index"
                  className="font-mono text-xs"
                />
              </div>
            </>
          )}

          {type === 'while' && (
            <>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="logic-condition-while" className="text-xs font-medium text-gray-300">
                  Condition Expression <span className="text-red-500">*</span>
                </label>
                <Textarea
                  {...register('condition', { required: true })}
                  id="logic-condition-while"
                  placeholder="${counter < 10}"
                  rows={2}
                  className="font-mono text-xs"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="logic-maxIterations" className="text-xs font-medium text-gray-300">
                  Max Iterations
                </label>
                <Input
                  {...register('maxIterations', { valueAsNumber: true })}
                  id="logic-maxIterations"
                  type="number"
                  min={1}
                  placeholder="1000 (default)"
                  className="text-xs"
                />
                <p className="text-xs text-gray-400">Maximum iterations to prevent infinite loops (default: 1000)</p>
              </div>
            </>
          )}
        </>
      )}

      {logicType === 'converge' && (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="logic-timeout" className="text-xs font-medium text-gray-300">
              Timeout (ISO 8601 Duration)
            </label>
            <Input
              {...register('timeout')}
              id="logic-timeout"
              placeholder="PT5M (5 minutes)"
              className="font-mono text-xs"
            />
            <p className="text-xs text-gray-400">Maximum time to wait for all branches (e.g., PT5M, PT1H, P1D)</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="logic-onTimeout" className="text-xs font-medium text-gray-300">
              On Timeout
            </label>
            <NativeSelect {...register('onTimeout')} id="logic-onTimeout">
              <option value="fail">Fail - Stop workflow</option>
              <option value="continue">Continue - Proceed anyway</option>
            </NativeSelect>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="logic-aggregateOutputs" className="text-xs font-medium text-gray-300">
              Aggregate Outputs
            </label>
            <NativeSelect {...register('aggregateOutputs')} id="logic-aggregateOutputs">
              <option value="true">Yes - Collect outputs from all branches</option>
              <option value="false">No - Don't aggregate outputs</option>
            </NativeSelect>
          </div>

          <div className="rounded-md bg-blue-500/10 p-3">
            <p className="text-xs text-blue-300">
              <strong>Note:</strong> Converge nodes wait for all connected parallel branches to complete before
              proceeding. Connect incoming edges from the branches you want to synchronize.
            </p>
          </div>
        </>
      )}

      <Button type="submit" variant="primary" className="w-full justify-center text-xs">
        {submitButtonText ?? 'Add node'}
      </Button>
    </>
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
      maxIterations: data.logicType === 'loop' && data.type === 'while' ? data.maxIterations : undefined,
      indexVariable: data.logicType === 'loop' && data.type === 'forEach' ? data.indexVariable : undefined,
      itemVariable: data.logicType === 'loop' && data.type === 'forEach' ? data.itemVariable : undefined,
      timeout: data.logicType === 'converge' ? data.timeout : undefined,
      onTimeout: data.logicType === 'converge' ? data.onTimeout : undefined,
      aggregateOutputs: data.logicType === 'converge' ? data.aggregateOutputs : undefined,
    }
    props.onSubmit(cleanedData)
  }

  return (
    <Card variant="glass" padding="md" className="flex flex-col gap-3">
      <Form<LogicFormData>
        id="logic-node-form"
        defaultValues={defaultValues}
        onSubmit={handleSubmit}
        className="flex flex-col gap-3"
      >
        {() => <LogicFormFields submitButtonText={props.submitButtonText} />}
      </Form>
    </Card>
  )
}
