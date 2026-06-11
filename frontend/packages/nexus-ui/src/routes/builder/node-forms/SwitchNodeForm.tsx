import {
  Alert,
  Button,
  Content,
  ExpandableSection,
  Flex,
  FlexItem,
  Stack,
  StackItem,
  TextInput,
  Tooltip,
} from '@patternfly/react-core'
// eslint-disable-next-line no-restricted-imports -- RhMicronsCaretDownIcon is intentionally used here to match the chevron weight of PatternFly's ExpandableSection toggle
import { RhMicronsCaretDownIcon, RhUiAddCircleIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { Control } from 'react-hook-form'
import { Controller, FormProvider, useFieldArray, useForm, useFormContext } from 'react-hook-form'

import { DisabledWithTooltip } from '../../../components/DisabledWithTooltip'
import { ExpressionCondition } from '../../../components/expressions/ExpressionCondition'
import type {
  ComparisonOperator,
  ExpressionCondition as ExpressionConditionType,
} from '../../../utils/expressions/types'
import { generateUUID } from '../../../utils/generateUUID'

import { ActivityNameField } from './shared/ActivityNameField'
import { zodResolver } from './shared/formSchemaUtils'
import { NodeFormContainer } from './shared/NodeFormContainer'
import { NodeFormTabsLayout } from './shared/NodeFormTabsLayout'
import { switchFormSchema, type SwitchFormData } from './switchFormSchema'
import styles from './SwitchNodeForm.module.css'

export type { SwitchFormData }

const MIN_CASES = 1
const MAX_CASES = 100

function createEmptyCase(index: number) {
  return {
    id: generateUUID(),
    label: `Path ${index + 1}`,
    variable: '',
    operator: '==' as const,
    value: '',
    negate: false,
  }
}

type SwitchNodeFormProps = {
  onSubmit: (data: SwitchFormData) => void
  initialData?: Partial<SwitchFormData>
  onHeaderContentChange?: (content: ReactNode | null) => void
}

type SwitchCaseHeaderProps = {
  index: number
  label: string
  isExpanded: boolean
  hasError: boolean
  canRemove: boolean
  contentId: string
  onToggleExpanded: () => void
  onRemove: () => void
  onLabelChange: (value: string) => void
}

function SwitchCaseHeader({
  index,
  label,
  isExpanded,
  hasError,
  canRemove,
  contentId,
  onToggleExpanded,
  onRemove,
  onLabelChange,
}: SwitchCaseHeaderProps) {
  return (
    <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
      <FlexItem>
        <DisabledWithTooltip isDisabled={hasError} content="Fill in all required fields before collapsing">
          <Button
            variant="plain"
            className={styles.toggleButton}
            aria-expanded={isExpanded}
            aria-controls={contentId}
            isAriaDisabled={hasError}
            onClick={hasError ? undefined : onToggleExpanded}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} path ${index + 1}`}
          >
            <RhMicronsCaretDownIcon className={styles.toggleIcon} />
          </Button>
        </DisabledWithTooltip>
      </FlexItem>
      <FlexItem grow={{ default: 'grow' }}>
        <TextInput
          value={label}
          onChange={(_event, val) => onLabelChange(val)}
          aria-label={`Path ${index + 1} name`}
          placeholder={`Path ${index + 1}`}
        />
      </FlexItem>
      {canRemove && (
        <FlexItem>
          <Button variant="plain" isDanger onClick={onRemove} aria-label={`Remove path ${index + 1}`} size="sm">
            <RhUiTrashIcon />
          </Button>
        </FlexItem>
      )}
    </Flex>
  )
}

type SwitchCaseItemProps = {
  fieldId: string
  index: number
  control: Control<SwitchFormData>
  canRemove: boolean
  expandedPaths: Record<string, boolean>
  onToggleExpanded: () => void
  onRemove: () => void
}

function SwitchCaseItem({
  fieldId,
  index,
  control,
  canRemove,
  expandedPaths,
  onToggleExpanded,
  onRemove,
}: SwitchCaseItemProps) {
  const contentId = `case-content-${fieldId}`

  return (
    <Controller
      control={control}
      name={`cases.${index}`}
      render={({ field, fieldState }) => {
        const currentCase = field.value
        const caseErrors = fieldState.error as Record<string, { message?: string }> | undefined
        const hasError = !!caseErrors
        const isExpanded = (expandedPaths[fieldId] ?? true) || hasError

        const handleFieldChange = (updates: Partial<ExpressionConditionType>) => {
          field.onChange({ ...currentCase, ...updates })
        }

        return (
          <Stack hasGutter>
            <StackItem>
              <SwitchCaseHeader
                index={index}
                label={currentCase?.label ?? ''}
                isExpanded={isExpanded}
                hasError={hasError}
                canRemove={canRemove}
                contentId={contentId}
                onToggleExpanded={onToggleExpanded}
                onRemove={onRemove}
                onLabelChange={(val) => field.onChange({ ...currentCase, label: val })}
              />
            </StackItem>

            {isExpanded && (
              <StackItem id={contentId}>
                <ExpressionCondition
                  condition={{
                    type: 'condition',
                    id: fieldId,
                    variable: currentCase?.variable ?? '',
                    operator: (currentCase?.operator ?? '==') as ComparisonOperator,
                    value: currentCase?.value ?? '',
                    negate: currentCase?.negate ?? false,
                  }}
                  onChange={handleFieldChange}
                  error={hasError}
                  fieldErrors={{
                    variable: caseErrors?.variable?.message,
                    value: caseErrors?.value?.message,
                  }}
                />
              </StackItem>
            )}
          </Stack>
        )
      }}
    />
  )
}

function SwitchFormFields({ onHeaderContentChange }: { onHeaderContentChange?: (content: ReactNode | null) => void }) {
  const { register, control } = useFormContext<SwitchFormData>()

  const { fields, append, remove } = useFieldArray({ control, name: 'cases' })
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({})
  const [fallbackExpanded, setFallbackExpanded] = useState(true)

  const nameField = useMemo(
    () => <ActivityNameField register={register} fieldId="switch-name" ariaLabel="Name" />,
    [register]
  )

  useEffect(() => {
    onHeaderContentChange?.(nameField)
    return () => {
      onHeaderContentChange?.(null)
    }
  }, [nameField, onHeaderContentChange])

  const handleAddPath = () => {
    if (fields.length < MAX_CASES) {
      append(createEmptyCase(fields.length))
    }
  }

  const handleRemovePath = (index: number) => {
    if (fields.length > MIN_CASES) {
      remove(index)
    }
  }

  const parametersContent = (
    <Stack hasGutter>
      {!onHeaderContentChange && (
        <StackItem>
          <ActivityNameField register={register} fieldId="switch-name" />
        </StackItem>
      )}

      <StackItem>
        <Alert variant="info" isInline isPlain title="The workflow will run on the path that is the first match.">
          <Content component="p">Reorder paths based on path run priority.</Content>
        </Alert>
      </StackItem>

      {fields.map((field, index) => (
        <StackItem key={field.id}>
          <SwitchCaseItem
            fieldId={field.id}
            index={index}
            control={control}
            canRemove={fields.length > MIN_CASES}
            expandedPaths={expandedPaths}
            onToggleExpanded={() => setExpandedPaths((prev) => ({ ...prev, [field.id]: !(prev[field.id] ?? true) }))}
            onRemove={() => handleRemovePath(index)}
          />
        </StackItem>
      ))}

      <StackItem>
        <Flex>
          <FlexItem>
            {fields.length >= MAX_CASES ? (
              <Tooltip content="Maximum of 100 paths reached.">
                <Button variant="link" icon={<RhUiAddCircleIcon />} isDisabled>
                  Add path
                </Button>
              </Tooltip>
            ) : (
              <Button variant="link" icon={<RhUiAddCircleIcon />} onClick={handleAddPath}>
                Add path
              </Button>
            )}
          </FlexItem>
        </Flex>
      </StackItem>

      <StackItem>
        <ExpandableSection
          toggleText="Fallback path"
          isIndented
          isExpanded={fallbackExpanded}
          onToggle={(_event, expanded) => setFallbackExpanded(expanded)}
        >
          <Content component="p">
            If the automation does not match any of the path criteria, the automation will route to the fallback path.
            If no nodes are connected to the fallback path the automation will stop.
          </Content>
        </ExpandableSection>
      </StackItem>
    </Stack>
  )

  return <NodeFormTabsLayout parametersContent={parametersContent} />
}

export function SwitchNodeForm(props: SwitchNodeFormProps) {
  const defaultCases = props.initialData?.cases?.length
    ? props.initialData.cases
    : [createEmptyCase(0), createEmptyCase(1)]

  const defaultValues: SwitchFormData = {
    name: props.initialData?.name ?? '',
    cases: defaultCases,
  }

  const methods = useForm<SwitchFormData>({
    resolver: zodResolver(switchFormSchema, undefined, { mode: 'sync' }),
    defaultValues,
  })

  useEffect(() => {
    methods.reset(defaultValues)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when initialData identity changes
  }, [props.initialData])

  return (
    <FormProvider {...methods}>
      <NodeFormContainer formId="switch-node-form" onSubmit={methods.handleSubmit(props.onSubmit)}>
        <SwitchFormFields onHeaderContentChange={props.onHeaderContentChange} />
      </NodeFormContainer>
    </FormProvider>
  )
}
