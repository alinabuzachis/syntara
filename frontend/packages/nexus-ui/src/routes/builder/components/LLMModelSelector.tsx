import type { IntegrationsAPI } from '@ansible/nexus-contracts'
import { IntegrationTypeEnum } from '@ansible/nexus-contracts'
import {
  Button,
  Divider,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  MenuToggle,
  type MenuToggleElement,
  Select,
  SelectGroup,
  SelectList,
  SelectOption,
  TextInputGroup,
  TextInputGroupMain,
  TextInputGroupUtilities,
} from '@patternfly/react-core'
import { RhUiCloseIcon } from '@patternfly/react-icons'
import { useQueries } from '@tanstack/react-query'
import React, { useCallback, useMemo, useState } from 'react'

import { AppRoute } from '../../../app/AppRoute'
import { integrationsFetchClient, integrationsClient } from '../../../client'
import { FormLabelWithHelp } from '../../../components/FormLabelWithHelp'
import { NxLabel } from '../../../components/labels/NxLabel'
import { NxLink } from '../../../components/NxLink'
import { useIntegrationPermissions } from '../../configuration/integrations/useIntegrationPermissions'

import styles from './LLMModelSelector.module.css'

type IntegrationRead = IntegrationsAPI.components['schemas']['IntegrationRead']
type LLMModelRead = IntegrationsAPI.components['schemas']['LLMModelRead']

export type LLMModelSelection = {
  llm_model_id: string
}

export type LLMModelSelectorProps = {
  /** Currently selected model, or undefined when nothing is chosen. */
  value?: LLMModelSelection
  /** Called when the user picks or clears a model. */
  onChange: (selection: LLMModelSelection | undefined) => void
  /** Label shown above the selector. */
  label?: string
  /** HTML `id` used for the FormGroup and inner elements. */
  fieldId?: string
  /** Disables the selector (e.g. in version-view mode). */
  isDisabled?: boolean
  /** Help text rendered in a popover next to the label. */
  helpText?: React.ReactNode
}

type VisibleGroup = {
  integration: IntegrationRead & { id: string }
  models: LLMModelRead[]
}

type ModelMenuToggleProps = Readonly<{
  toggleRef: React.Ref<MenuToggleElement>
  displayText: string
  ariaLabel: string
  fieldId: string
  isOpen: boolean
  isDisabled: boolean
  isPending: boolean
  hasSelection: boolean
  filterText: string
  onFilterChange: (val: string) => void
  onClear: () => void
  onToggle: () => void
}>

function ModelMenuToggle({
  toggleRef,
  displayText,
  ariaLabel,
  fieldId,
  isOpen,
  isDisabled,
  isPending,
  hasSelection,
  filterText,
  onFilterChange,
  onClear,
  onToggle,
}: ModelMenuToggleProps) {
  const showClearFilter = isOpen && filterText
  const showClearSelection = !isOpen && hasSelection && !isDisabled && !isPending

  return (
    <MenuToggle
      ref={toggleRef}
      variant="typeahead"
      isExpanded={isOpen}
      isDisabled={isDisabled || isPending}
      isFullWidth
      aria-label={ariaLabel}
      onClick={onToggle}
    >
      <TextInputGroup isPlain isDisabled={isDisabled || isPending}>
        <TextInputGroupMain
          value={isOpen ? filterText : displayText}
          placeholder={isPending ? 'Loading models...' : 'Select a model'}
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          onChange={(_event, val) => onFilterChange(val)}
          autoComplete="off"
          id={`${fieldId}-filter`}
          aria-label={ariaLabel}
        />
        {showClearFilter && (
          <TextInputGroupUtilities>
            <Button variant="plain" onClick={() => onFilterChange('')} aria-label="Clear filter">
              <RhUiCloseIcon />
            </Button>
          </TextInputGroupUtilities>
        )}
        {showClearSelection && (
          <TextInputGroupUtilities>
            <Button
              variant="plain"
              onClick={(e) => {
                e.stopPropagation()
                onClear()
              }}
              aria-label="Clear selection"
            >
              <RhUiCloseIcon />
            </Button>
          </TextInputGroupUtilities>
        )}
      </TextInputGroup>
    </MenuToggle>
  )
}

/**
 * A PatternFly grouped typeahead Select for choosing an LLM model.
 *
 * Fetches all enabled llm_provider integrations, then loads each integration's
 * models in parallel. Renders a grouped list where each group header is the
 * integration name, groups are separated by dividers, and each model row shows
 * the model name with an optional description (e.g. context window size) and a
 * "Default" badge for the integration's default model.
 *
 * Typing in the toggle filters models by name, model ID, or description across
 * all groups. The toggle displays "{Integration Name} / {Model Name}" when a
 * selection is active.
 */
export function LLMModelSelector({
  value,
  onChange,
  label = 'Model',
  fieldId = 'llm-model-selector',
  isDisabled = false,
  helpText,
}: Readonly<LLMModelSelectorProps>) {
  const [isOpen, setIsOpen] = useState(false)
  const [filterText, setFilterText] = useState('')

  const { data: integrationsData, isPending: isIntegrationsPending } = integrationsClient.useQuery(
    'get',
    '/integrations',
    {
      params: {
        query: { integration_type: IntegrationTypeEnum.LLM_PROVIDER, enabled: true },
      },
    }
  )

  // Only include integrations that have a defined ID
  const integrations: (IntegrationRead & { id: string })[] = useMemo(
    () => (integrationsData?.resources ?? []).filter((i): i is IntegrationRead & { id: string } => !!i.id),
    [integrationsData?.resources]
  )

  const { modelsByIntegration, isModelsPending, failedIntegrationIds } = useQueries({
    queries: integrations.map((integration) => ({
      queryKey: ['integrations', integration.id, 'models'],
      queryFn: async () => {
        const response = await integrationsFetchClient.GET('/integrations/{integration_id}/models', {
          params: { path: { integration_id: integration.id }, query: { sort: 'name' } },
        })
        if (response.error) {
          throw new Error(`Failed to fetch models for integration ${integration.name ?? integration.id}`)
        }
        return { integrationId: integration.id, models: response.data?.resources ?? [] }
      },
      enabled: !isIntegrationsPending,
      staleTime: 5 * 60 * 1000,
    })),
    combine: (results) => ({
      modelsByIntegration: new Map(results.filter((r) => r.data).map((r) => [r.data!.integrationId, r.data!.models])),
      isModelsPending: results.some((r) => r.isPending),
      failedIntegrationIds: new Set(
        results.reduce<string[]>((acc, r, i) => {
          if (r.isError && integrations[i]?.id) acc.push(integrations[i].id)
          return acc
        }, [])
      ),
    }),
  })

  const isPending = isIntegrationsPending || isModelsPending

  // Groups visible after applying the typeahead filter
  const visibleGroups = useMemo((): VisibleGroup[] => {
    const query = filterText.toLowerCase().trim()
    return integrations
      .map((integration) => {
        const models = modelsByIntegration.get(integration.id) ?? []
        if (!query) return { integration, models }
        const integrationNameMatches = integration.name.toLowerCase().includes(query)
        const filteredModels = integrationNameMatches
          ? models
          : models.filter(
              (m) =>
                m.name.toLowerCase().includes(query) ||
                m.model_id.toLowerCase().includes(query) ||
                (m.description?.toLowerCase().includes(query) ?? false)
            )
        return { integration, models: filteredModels }
      })
      .filter(({ integration, models }) => models.length > 0 || failedIntegrationIds.has(integration.id))
  }, [integrations, modelsByIntegration, filterText, failedIntegrationIds])

  // Display label shown in the toggle when the dropdown is closed
  const toggleLabel = useMemo(() => {
    if (!value) return ''
    for (const integration of integrations) {
      const models = modelsByIntegration.get(integration.id) ?? []
      const model = models.find((m) => m.id === value.llm_model_id)
      if (model) return `${integration.name} / ${model.name}`
    }
    return value.llm_model_id
  }, [value, integrations, modelsByIntegration])

  const handleSelect = useCallback(
    (_event: React.MouseEvent | undefined, selectedValue: string | number | undefined) => {
      setIsOpen(false)
      setFilterText('')
      if (!selectedValue || typeof selectedValue !== 'string') {
        onChange(undefined)
        return
      }
      onChange({ llm_model_id: selectedValue })
    },
    [onChange]
  )

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open)
    if (!open) setFilterText('')
  }, [])

  const selectedKey = value?.llm_model_id
  const isFiltering = filterText.trim().length > 0
  const hasAnyModels = integrations.some((i) => (modelsByIntegration.get(i.id)?.length ?? 0) > 0)

  const renderToggle = useCallback(
    (toggleRef: React.Ref<MenuToggleElement>) => (
      <ModelMenuToggle
        toggleRef={toggleRef}
        displayText={toggleLabel}
        ariaLabel={label}
        fieldId={fieldId}
        isOpen={isOpen}
        isDisabled={isDisabled}
        isPending={isPending}
        hasSelection={!!selectedKey}
        filterText={filterText}
        onFilterChange={setFilterText}
        onClear={() => onChange(undefined)}
        onToggle={() => setIsOpen((prev) => !prev)}
      />
    ),
    [toggleLabel, label, fieldId, isOpen, isDisabled, isPending, selectedKey, filterText, onChange]
  )

  const formGroupLabel = helpText ? <FormLabelWithHelp label={label} helpText={helpText} /> : label

  const hasNoIntegrations = integrations.length === 0 && !isPending
  const { canCreate: canCreateIntegration } = useIntegrationPermissions()

  return (
    <FormGroup label={formGroupLabel} fieldId={fieldId} isRequired>
      <Select
        id={fieldId}
        isOpen={isOpen}
        selected={selectedKey}
        onSelect={handleSelect}
        onOpenChange={handleOpenChange}
        toggle={renderToggle}
        isScrollable
        maxMenuHeight="300px"
        shouldFocusToggleOnSelect
      >
        <SelectList>
          {hasNoIntegrations && (
            <SelectOption isAriaDisabled value="__empty__">
              No LLM provider integrations configured
            </SelectOption>
          )}
          {isFiltering && visibleGroups.length === 0 && (
            <SelectOption isAriaDisabled value="__no_results__">
              No results match &quot;{filterText}&quot;
            </SelectOption>
          )}
          {!hasAnyModels && !isPending && integrations.length > 0 && !isFiltering && (
            <SelectOption isAriaDisabled value="__no_models__">
              No models available — refresh integrations to discover models
            </SelectOption>
          )}
        </SelectList>
        {visibleGroups.map(({ integration, models }, idx) => (
          <React.Fragment key={integration.id}>
            {idx > 0 && <Divider />}
            <SelectGroup label={integration.name}>
              <SelectList>
                {failedIntegrationIds.has(integration.id) && (
                  <SelectOption isAriaDisabled value={`__error_${integration.id}`}>
                    Failed to load models
                  </SelectOption>
                )}
                {models.map((model) => (
                  <SelectOption
                    key={model.id}
                    value={model.id}
                    isSelected={selectedKey === model.id}
                    description={model.description ?? undefined}
                  >
                    <span className={styles.modelOptionContent}>
                      <span>{model.name}</span>
                      {model.is_default === true && <NxLabel color="blue">Default</NxLabel>}
                    </span>
                  </SelectOption>
                ))}
              </SelectList>
            </SelectGroup>
          </React.Fragment>
        ))}
      </Select>
      {hasNoIntegrations && (
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              {canCreateIntegration ? (
                <>
                  An administrator must{' '}
                  <NxLink to={AppRoute.Configuration.Integrations.Configure}>
                    configure an LLM provider integration
                  </NxLink>{' '}
                  before models can be selected.
                </>
              ) : (
                'An administrator must configure an LLM provider integration before models can be selected.'
              )}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
    </FormGroup>
  )
}
