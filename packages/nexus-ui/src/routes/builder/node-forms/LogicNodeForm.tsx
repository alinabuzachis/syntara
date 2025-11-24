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
  loopType?: string
  items?: string
  count?: number
  maxIterations?: number
  joinStrategy?: string
  joinCount?: number
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
  const loopType = useWatch({ name: 'loopType' })
  const joinStrategy = useWatch({ name: 'joinStrategy' })

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
            <label htmlFor="logic-loopType" className="text-xs font-medium text-gray-300">
              Loop Type
            </label>
            <NativeSelect {...register('loopType')} id="logic-loopType">
              <option value="forEach">For Each</option>
              <option value="while">While</option>
              <option value="count">Count</option>
            </NativeSelect>
          </div>

          {loopType === 'forEach' && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="logic-items" className="text-xs font-medium text-gray-300">
                Items Expression <span className="text-red-500">*</span>
              </label>
              <Input
                {...register('items', { required: true })}
                id="logic-items"
                placeholder="${input.users}"
                className="font-mono text-xs"
              />
            </div>
          )}

          {loopType === 'while' && (
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
                  className="text-xs"
                />
              </div>
            </>
          )}

          {loopType === 'count' && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="logic-count" className="text-xs font-medium text-gray-300">
                Iteration Count <span className="text-red-500">*</span>
              </label>
              <Input
                {...register('count', { required: true, valueAsNumber: true })}
                id="logic-count"
                type="number"
                min={1}
                className="text-xs"
              />
            </div>
          )}
        </>
      )}

      {logicType === 'converge' && (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="logic-joinStrategy" className="text-xs font-medium text-gray-300">
              Join Strategy
            </label>
            <NativeSelect {...register('joinStrategy')} id="logic-joinStrategy">
              <option value="all">All - Wait for all branches</option>
              <option value="any">Any - Wait for first completion</option>
              <option value="majority">Majority - Wait for &gt;50%</option>
              <option value="count">Count - Wait for specific number</option>
            </NativeSelect>
          </div>

          {joinStrategy === 'count' && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="logic-joinCount" className="text-xs font-medium text-gray-300">
                Required Branch Count <span className="text-red-500">*</span>
              </label>
              <Input
                {...register('joinCount', { required: true, valueAsNumber: true })}
                id="logic-joinCount"
                type="number"
                min={1}
                className="text-xs"
              />
            </div>
          )}

          <div className="rounded-md bg-blue-500/10 p-3">
            <p className="text-xs text-blue-300">
              <strong>Note:</strong> Converge (Join) nodes wait for multiple parallel branches to complete before
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
    loopType: 'forEach',
    count: 10,
    maxIterations: 1000,
    joinStrategy: 'all',
    joinCount: 2,
    ...props.initialData,
  }

  const handleSubmit = (data: LogicFormData) => {
    const cleanedData: LogicFormData = {
      name: data.name,
      logicType: data.logicType,
      condition:
        data.logicType === 'condition' || (data.logicType === 'loop' && data.loopType === 'while')
          ? data.condition
          : undefined,
      loopType: data.logicType === 'loop' ? data.loopType : undefined,
      items: data.logicType === 'loop' && data.loopType === 'forEach' ? data.items : undefined,
      count: data.logicType === 'loop' && data.loopType === 'count' ? data.count : undefined,
      maxIterations: data.logicType === 'loop' && data.loopType === 'while' ? data.maxIterations : undefined,
      joinStrategy: data.logicType === 'converge' ? data.joinStrategy : undefined,
      joinCount: data.logicType === 'converge' && data.joinStrategy === 'count' ? data.joinCount : undefined,
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
