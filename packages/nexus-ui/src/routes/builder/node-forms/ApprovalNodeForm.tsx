import {
  Flex,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Label,
  Stack,
  StackItem,
  TextArea,
  TextInput,
  Title,
} from '@patternfly/react-core'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Controller, FormProvider, useForm, useFormContext } from 'react-hook-form'

import { ActivityNameField } from './shared/ActivityNameField'
import { NodeFormContainer } from './shared/NodeFormContainer'
import { NodeFormTabsLayout } from './shared/NodeFormTabsLayout'

// Helper function to break down total seconds into days, hours, minutes, seconds
function secondsToTimeUnits(totalSeconds: number): {
  days: number
  hours: number
  minutes: number
  seconds: number
} {
  const days = Math.floor(totalSeconds / 86400)
  const remainingAfterDays = totalSeconds % 86400
  const hours = Math.floor(remainingAfterDays / 3600)
  const remainingAfterHours = remainingAfterDays % 3600
  const minutes = Math.floor(remainingAfterHours / 60)
  const seconds = remainingAfterHours % 60

  return { days, hours, minutes, seconds }
}

// Helper function to convert time units back to total seconds
function timeUnitsToSeconds(seconds: number = 0, minutes: number = 0, hours: number = 0, days: number = 0): number {
  return seconds + minutes * 60 + hours * 3600 + days * 86400
}

// Form data structure used internally by the form (approvers as comma-separated string, timeout broken into units)
interface ApprovalFormData {
  name: string
  approvers: string
  prompt: string
  timeoutSeconds?: number
  timeoutMinutes?: number
  timeoutHours?: number
  timeoutDays?: number
  onTimeout: string
}

// Data structure for form submission (name + API approval definition)
// Note: timeout is in seconds as a number
export type ApprovalFormSubmitData = {
  name: string
  approvers: string[]
  prompt: string
  timeout?: number
  onTimeout?: 'fail' | 'approve' | 'reject'
  metadata?: {
    [key: string]: unknown
  }
  outputs?: {
    approved?: boolean
    approver?: string
    timestamp?: string
    comments?: string
  }
}

interface ApprovalNodeFormProps {
  onSubmit: (data: ApprovalFormSubmitData) => void
  onCancel: () => void
  submitButtonText?: string
  initialData?: Partial<ApprovalFormSubmitData>
  onHeaderContentChange?: (content: ReactNode | null) => void
}

function ApprovalFormFields({
  submitButtonText,
  initialApprovers,
  onHeaderContentChange,
}: {
  submitButtonText?: string
  initialApprovers: string[]
  onHeaderContentChange?: (content: ReactNode | null) => void
}) {
  const { register, control, setValue } = useFormContext<ApprovalFormData>()
  const [inputValue, setInputValue] = useState('')
  const [approversList, setApproversList] = useState<string[]>(initialApprovers)

  const handleAddApprover = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      e.stopPropagation()
      const newApprover = inputValue.trim()
      if (newApprover && !approversList.includes(newApprover)) {
        const updatedList = [...approversList, newApprover]
        setApproversList(updatedList)
        setValue('approvers', updatedList.join(', '), { shouldValidate: true })
        setInputValue('')
      } else {
        setInputValue('')
      }
    }
  }

  const handleRemoveApprover = (approverToRemove: string) => {
    const updatedList = approversList.filter((a) => a !== approverToRemove)
    setApproversList(updatedList)
    setValue('approvers', updatedList.join(', '), { shouldValidate: true })
  }

  const nameField = useMemo(
    () => <ActivityNameField register={register} fieldId="approval-name" ariaLabel="Name" />,
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
      <StackItem>
        <FormGroup label="Usernames to notify" isRequired fieldId="approval-approvers">
          <Controller
            name="approvers"
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <>
                <input type="hidden" {...field} />
                <Flex
                  className="pf-v6-c-form-control"
                  flexWrap={{ default: 'wrap' }}
                  alignItems={{ default: 'alignItemsCenter' }}
                  columnGap={{ default: 'columnGapSm' }}
                  rowGap={{ default: 'rowGapSm' }}
                  style={{
                    height: 'auto',
                    minHeight: '36px',
                    padding:
                      'var(--pf-t--global--spacer--control--vertical--default) var(--pf-t--global--spacer--control--horizontal--default)',
                    cursor: 'text',
                  }}
                  onClick={() => {
                    document.getElementById('approval-approvers-inline-input')?.focus()
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      document.getElementById('approval-approvers-inline-input')?.focus()
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  {approversList.map((approver) => (
                    <Label
                      key={approver}
                      color="grey"
                      onClose={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleRemoveApprover(approver)
                      }}
                      closeBtnAriaLabel={`Remove ${approver}`}
                    >
                      {approver}
                    </Label>
                  ))}
                  <input
                    id="approval-approvers-inline-input"
                    type="text"
                    placeholder={approversList.length === 0 ? 'username1' : ''}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleAddApprover}
                    aria-label="Add approver"
                    style={{
                      flex: '1',
                      minWidth: '100px',
                      border: 'none',
                      outline: 'none',
                      backgroundColor: 'transparent',
                      padding: '0',
                      margin: '0',
                      fontFamily: 'inherit',
                      fontSize: 'inherit',
                    }}
                  />
                </Flex>
              </>
            )}
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Type a username and press Enter or comma to add</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Message" fieldId="approval-prompt">
          <TextArea
            {...register('prompt')}
            id="approval-prompt"
            placeholder="Please approve this deployment to production"
            rows={3}
          />
        </FormGroup>
      </StackItem>
      <StackItem>
        <Title headingLevel="h4" size="md" style={{ marginTop: 'var(--pf-t--global--spacer--sm)' }}>
          Timeout after time interval:
        </Title>
      </StackItem>
      <StackItem>
        <FormGroup label="Second(s)" fieldId="approval-timeout-seconds">
          <TextInput
            {...register('timeoutSeconds', { valueAsNumber: true })}
            id="approval-timeout-seconds"
            placeholder="Enter number of seconds"
            type="number"
            min={0}
          />
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Minute(s)" fieldId="approval-timeout-minutes">
          <TextInput
            {...register('timeoutMinutes', { valueAsNumber: true })}
            id="approval-timeout-minutes"
            placeholder="Enter number of minutes"
            type="number"
            min={0}
          />
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Hour(s)" fieldId="approval-timeout-hours">
          <TextInput
            {...register('timeoutHours', { valueAsNumber: true })}
            id="approval-timeout-hours"
            placeholder="Enter number of hours"
            type="number"
            min={0}
          />
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Day(s)" fieldId="approval-timeout-days">
          <TextInput
            {...register('timeoutDays', { valueAsNumber: true })}
            id="approval-timeout-days"
            placeholder="Enter number of days"
            type="number"
            min={0}
          />
        </FormGroup>
      </StackItem>
    </Stack>
  )

  return <NodeFormTabsLayout parametersContent={parametersContent} submitButtonText={submitButtonText} />
}

export function ApprovalNodeForm(props: ApprovalNodeFormProps) {
  // Convert initialData from ApprovalFormSubmitData format (approvers as array, timeout as number)
  // to ApprovalFormData format (approvers as comma-separated string, timeout broken into units)
  const initialApprovers = props.initialData?.approvers ?? []
  const initialTimeout = props.initialData?.timeout ?? 86400
  const timeUnits = secondsToTimeUnits(initialTimeout)

  const defaultValues: ApprovalFormData = {
    name: props.initialData?.name ?? '',
    approvers: initialApprovers.join(', '),
    prompt: props.initialData?.prompt ?? '',
    timeoutSeconds: timeUnits.seconds,
    timeoutMinutes: timeUnits.minutes,
    timeoutHours: timeUnits.hours,
    timeoutDays: timeUnits.days,
    onTimeout: props.initialData?.onTimeout ?? 'fail',
  }

  const handleSubmit = (data: ApprovalFormData) => {
    // Parse comma-separated approvers into array and trim whitespace
    const approversList = data.approvers
      .split(',')
      .map((email) => email.trim())
      .filter((email) => email.length > 0)

    // Convert time units back to total seconds
    // Ensure all values are valid numbers, default to 0 for undefined/NaN/null
    const totalTimeoutSeconds = timeUnitsToSeconds(
      Number(data.timeoutSeconds) || 0,
      Number(data.timeoutMinutes) || 0,
      Number(data.timeoutHours) || 0,
      Number(data.timeoutDays) || 0
    )

    // Convert form data to API format
    const submitData: ApprovalFormSubmitData = {
      name: data.name.trim(),
      approvers: approversList,
      prompt: data.prompt.trim(),
      // Timeout is in seconds as a number
      timeout: totalTimeoutSeconds > 0 ? totalTimeoutSeconds : undefined,
      // Only include onTimeout if timeout is specified
      onTimeout: totalTimeoutSeconds > 0 ? (data.onTimeout as 'fail' | 'approve' | 'reject') : undefined,
    }

    props.onSubmit(submitData)
  }

  const methods = useForm<ApprovalFormData>({
    defaultValues,
  })

  return (
    <FormProvider {...methods}>
      <NodeFormContainer formId="approval-node-form" onSubmit={methods.handleSubmit(handleSubmit)}>
        <ApprovalFormFields
          submitButtonText={props.submitButtonText}
          initialApprovers={initialApprovers}
          onHeaderContentChange={props.onHeaderContentChange}
        />
      </NodeFormContainer>
    </FormProvider>
  )
}
