import type { IntegrationsAPI } from '@ansible/nexus-contracts'
import { IntegrationTypeEnum } from '@ansible/nexus-contracts'
import {
  Divider,
  FormGroup,
  type MenuToggleElement,
  SelectGroup,
  SelectList,
  SelectOption,
} from '@patternfly/react-core'
import { useQueries } from '@tanstack/react-query'
import React, { type ReactElement, useCallback, useMemo, useState } from 'react'

import { integrationsClient } from '../../../client'
import { NxLabel } from '../../../components/labels/NxLabel'
import { NxSelect } from '../../../components/NxSelect'
import { projectIdParam } from '../../../utils/queryParams'
import { fetchAllIntegrationModels } from '../../configuration/integrations/useAllIntegrationModels'

import { IntegrationRequiredHelper } from './IntegrationRequiredHelper'
import styles from './LLMModelSelector.module.css'
import { resolveFormGroupLabelHelp } from './resolveFormGroupLabelHelp'
import { TypeaheadMenuToggle } from './TypeaheadMenuToggle'

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
  /** When provided, filters LLM provider integrations to those that are global or assigned to this project. */
  projectId?: string
  /** Pre-built label help (takes precedence over helpText) */
  labelHelp?: ReactElement
}

type VisibleGroup = {
  integration: IntegrationRead & { id: string }
  models: LLMModelRead[]
}

function resolveToggleLabel(
  value: LLMModelSelection | undefined,
  integrations: (IntegrationRead & { id: string })[],
  modelsByIntegration: Map<string, LLMModelRead[]>
): string {
  if (!value) return ''
  for (const integration of integrations) {
    const models = modelsByIntegration.get(integration.id) ?? []
    const model = models.find((m) => m.id === value.llm_model_id)
    if (model) return `${integration.name} / ${model.name}`
  }
  return value.llm_model_id
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
  projectId,
  labelHelp,
}: Readonly<LLMModelSelectorProps>) {
  const [isOpen, setIsOpen] = useState(false)
  const [filterText, setFilterText] = useState('')

  const { data: integrationsData, isPending: isIntegrationsPending } = integrationsClient.useQuery(
    'get',
    '/integrations',
    {
      params: {
        query: {
          integration_type: IntegrationTypeEnum.LLM_PROVIDER,
          enabled: true,
          ...projectIdParam(projectId),
        },
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
      queryKey: ['all-integration-models', integration.id],
      queryFn: () => fetchAllIntegrationModels(integration.id),
      enabled: !isIntegrationsPending,
      staleTime: 5 * 60 * 1000,
    })),
    combine: (results) => ({
      modelsByIntegration: new Map(
        results
          .map((r, i) => [integrations[i]?.id, r.data] as const)
          .filter((entry): entry is [string, LLMModelRead[]] => !!entry[0] && !!entry[1])
      ),
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

  const visibleGroups = useMemo((): VisibleGroup[] => {
    const query = filterText.toLowerCase().trim()
    const defaultFirst = (a: LLMModelRead, b: LLMModelRead) => {
      if (a.is_default && !b.is_default) return -1
      if (!a.is_default && b.is_default) return 1
      return 0
    }
    return integrations
      .map((integration) => {
        const models = [...(modelsByIntegration.get(integration.id) ?? [])]
          .filter((m) => m.enabled !== false)
          .sort(defaultFirst)
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

  const toggleLabel = useMemo(
    () => resolveToggleLabel(value, integrations, modelsByIntegration),
    [value, integrations, modelsByIntegration]
  )

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
      <TypeaheadMenuToggle
        toggleRef={toggleRef}
        displayText={toggleLabel}
        ariaLabel={label}
        fieldId={fieldId}
        isOpen={isOpen}
        isDisabled={isDisabled}
        isPending={isPending}
        hasSelection={!!selectedKey}
        filterText={filterText}
        placeholder="Select a model"
        loadingPlaceholder="Loading models..."
        onFilterChange={setFilterText}
        onClear={() => onChange(undefined)}
        onToggle={() => setIsOpen((prev) => !prev)}
      />
    ),
    [toggleLabel, label, fieldId, isOpen, isDisabled, isPending, selectedKey, filterText, onChange]
  )

  const resolvedLabelHelp = resolveFormGroupLabelHelp(label, labelHelp, helpText)

  const hasNoIntegrations = integrations.length === 0 && !isPending

  return (
    <FormGroup label={label} labelHelp={resolvedLabelHelp} fieldId={fieldId} isRequired>
      <NxSelect
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
      </NxSelect>

      {hasNoIntegrations && (
        <IntegrationRequiredHelper
          integrationLabel="an LLM provider integration"
          actionLabel="models can be selected"
        />
      )}
    </FormGroup>
  )
}
