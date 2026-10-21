import {
  Alert,
  Button,
  FormGroup,
  HelperText,
  HelperTextItem,
  MenuToggle,
  SelectList,
  SelectOption,
  Spinner,
  Stack,
  StackItem,
  TextInput,
  TextInputGroup,
  TextInputGroupMain,
  TextInputGroupUtilities,
} from '@patternfly/react-core'
import { RhUiCloseIcon } from '@patternfly/react-icons'
import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'

import { SynSelect } from '../../../components/SynSelect'

import type { ChildWorkflowOption, InvocationTrigger } from './useChildWorkflowSelector'

const DEBOUNCE_MS = 300

export type ChildWorkflowSelectorProps = {
  options: ChildWorkflowOption[]
  selectedOption?: ChildWorkflowOption
  selectedWorkflowId: string | null
  selectedTriggerNodeId: string
  workflowError?: string
  triggerError?: string
  onWorkflowChange: (workflowId: string | null, defaultTriggerId: string) => void
  onTriggerChange: (triggerNodeId: string) => void
  setSearchTerm: (searchTerm: string) => void
  isLoading: boolean
  hasError: boolean
  label?: string
  labelHelp?: ReactElement
  triggerLabelHelp?: ReactElement
  isRequired?: boolean
  isDisabled?: boolean
}

function getTriggerLabel(trigger: InvocationTrigger, index: number) {
  return trigger.name?.trim() || `Trigger ${index + 1}`
}

function InvocationTriggerSelector({
  triggers,
  selectedTriggerNodeId,
  onChange,
  isDisabled,
  error,
  labelHelp,
}: Readonly<{
  triggers: InvocationTrigger[]
  selectedTriggerNodeId: string
  onChange: (triggerNodeId: string) => void
  isDisabled: boolean
  error?: string
  labelHelp?: ReactElement
}>) {
  const [isOpen, setIsOpen] = useState(false)
  const selectedIndex = triggers.findIndex((trigger) => trigger.trigger_node_id === selectedTriggerNodeId)
  const selectedLabel =
    selectedIndex >= 0 ? getTriggerLabel(triggers[selectedIndex], selectedIndex) : 'Select a trigger...'

  return (
    <FormGroup label="Workflow trigger" labelHelp={labelHelp} isRequired fieldId="subworkflow-trigger-selector">
      <SynSelect
        id="subworkflow-trigger-selector"
        aria-label="Workflow trigger"
        isOpen={isOpen}
        selected={selectedTriggerNodeId || undefined}
        onSelect={(_event, value) => {
          if (value !== undefined) onChange(String(value))
          setIsOpen(false)
        }}
        onOpenChange={setIsOpen}
        shouldFocusToggleOnSelect
        toggle={(toggleRef) => (
          <MenuToggle
            ref={toggleRef}
            onClick={() => setIsOpen((open) => !open)}
            isExpanded={isOpen}
            isFullWidth
            isDisabled={isDisabled}
            aria-label="Workflow trigger"
          >
            {selectedLabel}
          </MenuToggle>
        )}
      >
        <SelectList>
          {triggers.map((trigger, index) => (
            <SelectOption key={trigger.trigger_node_id} value={trigger.trigger_node_id}>
              {getTriggerLabel(trigger, index)}
            </SelectOption>
          ))}
        </SelectList>
      </SynSelect>
      {error && (
        <HelperText>
          <HelperTextItem variant="error">{error}</HelperTextItem>
        </HelperText>
      )}
    </FormGroup>
  )
}

function StaticInvocationTrigger({
  trigger,
  labelHelp,
}: Readonly<{ trigger: InvocationTrigger; labelHelp?: ReactElement }>) {
  return (
    <FormGroup label="Workflow trigger" labelHelp={labelHelp} fieldId="selected-workflow-trigger">
      <TextInput
        id="selected-workflow-trigger"
        aria-label="Workflow trigger"
        value={getTriggerLabel(trigger, 0)}
        readOnly
        readOnlyVariant="plain"
      />
    </FormGroup>
  )
}

/** Select a published same-project workflow and one of its Subworkflow Triggers. */
export function ChildWorkflowSelector({
  options,
  selectedOption,
  selectedWorkflowId,
  selectedTriggerNodeId,
  workflowError,
  triggerError,
  onWorkflowChange,
  onTriggerChange,
  setSearchTerm,
  isLoading,
  hasError,
  label = 'Workflow',
  labelHelp,
  triggerLabelHelp,
  isRequired = false,
  isDisabled = false,
}: Readonly<ChildWorkflowSelectorProps>) {
  const [isOpen, setIsOpen] = useState(false)
  const [filterValue, setFilterValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    debounceRef.current = setTimeout(() => setSearchTerm(filterValue), DEBOUNCE_MS)
    return () => clearTimeout(debounceRef.current)
  }, [filterValue, setSearchTerm])

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  const onSelect = (_event: React.MouseEvent | undefined, value: string | number | undefined) => {
    const workflowId = value === undefined ? null : String(value)
    const option = options.find((candidate) => candidate.value === workflowId)
    const defaultTriggerId = option?.triggers.length === 1 ? option.triggers[0].trigger_node_id : ''

    onWorkflowChange(workflowId, defaultTriggerId)
    setFilterValue('')
    setIsOpen(false)
  }

  const clear = () => {
    onWorkflowChange(null, '')
    setFilterValue('')
    inputRef.current?.focus()
  }

  const onInputChange = (_event: React.FormEvent<HTMLInputElement>, value: string) => {
    setFilterValue(value)
    if (!isOpen) setIsOpen(true)
  }

  const displayLabel = selectedOption?.label ?? selectedWorkflowId ?? ''
  const noResultsText = isLoading ? 'Loading eligible workflows...' : 'No eligible workflows match this search.'
  const singleTrigger = selectedOption?.triggers.length === 1 ? selectedOption.triggers[0] : undefined

  return (
    <Stack hasGutter>
      <StackItem>
        <FormGroup label={label} labelHelp={labelHelp} isRequired={isRequired} fieldId="child-workflow-selector-input">
          <SynSelect
            id="child-workflow-selector"
            aria-label={label}
            isOpen={isOpen}
            onOpenChange={(open) => {
              setIsOpen(open)
              if (!open) setFilterValue('')
            }}
            onSelect={onSelect}
            selected={selectedWorkflowId ?? undefined}
            toggle={(toggleRef) => (
              <MenuToggle
                ref={toggleRef}
                variant="typeahead"
                onClick={() => setIsOpen((open) => !open)}
                isExpanded={isOpen}
                isFullWidth
                isDisabled={isDisabled}
                aria-label={label}
                status={hasError || workflowError ? 'danger' : undefined}
              >
                <TextInputGroup isPlain isDisabled={isDisabled}>
                  <TextInputGroupMain
                    value={isOpen ? filterValue : displayLabel}
                    id="child-workflow-selector-input"
                    aria-label={label}
                    onChange={onInputChange}
                    onClick={() => {
                      if (!isOpen) setIsOpen(true)
                    }}
                    placeholder="Search for a published workflow..."
                    autoComplete="off"
                    innerRef={inputRef}
                  />
                  <TextInputGroupUtilities>
                    {isLoading && <Spinner size="sm" aria-label="Loading workflows" />}
                    {selectedWorkflowId && !isLoading && !isDisabled && (
                      <Button
                        variant="plain"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          clear()
                        }}
                        aria-label="Clear selection"
                      >
                        <RhUiCloseIcon />
                      </Button>
                    )}
                  </TextInputGroupUtilities>
                </TextInputGroup>
              </MenuToggle>
            )}
          >
            <SelectList>
              {options.length === 0 ? (
                <SelectOption isDisabled>{noResultsText}</SelectOption>
              ) : (
                options.map((option) => (
                  <SelectOption
                    key={option.value}
                    value={option.value}
                    isSelected={option.value === selectedWorkflowId}
                    description={option.description}
                  >
                    {option.label}
                  </SelectOption>
                ))
              )}
            </SelectList>
          </SynSelect>
        </FormGroup>
        {workflowError && (
          <HelperText>
            <HelperTextItem variant="error">{workflowError}</HelperTextItem>
          </HelperText>
        )}
        {hasError && <Alert variant="danger" isInline isPlain title="Unable to verify eligible workflows" />}
      </StackItem>
      {singleTrigger && (
        <StackItem>
          <StaticInvocationTrigger trigger={singleTrigger} labelHelp={triggerLabelHelp} />
        </StackItem>
      )}
      {selectedOption && selectedOption.triggers.length > 1 && (
        <StackItem>
          <InvocationTriggerSelector
            triggers={selectedOption.triggers}
            selectedTriggerNodeId={selectedTriggerNodeId}
            onChange={onTriggerChange}
            isDisabled={isDisabled}
            error={triggerError}
            labelHelp={triggerLabelHelp}
          />
        </StackItem>
      )}
    </Stack>
  )
}
