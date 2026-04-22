import {
  Button,
  Label,
  LabelGroup,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  Spinner,
  TextInputGroup,
  TextInputGroupMain,
  TextInputGroupUtilities,
} from '@patternfly/react-core'
import { RhUiCloseIcon } from '@patternfly/react-icons'
import { type Ref, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { accessClient } from './accessClient'

interface PolicySelectProps {
  selected: string[]
  onChange: (selected: string[]) => void
  hasError?: boolean
  /** Filter policies by project scope. Omit or pass `null`/`undefined` for system (unfiltered), UUID for project-scoped. */
  scopeProjectId?: string | null
  /** When true, fetch only policies whose actions are valid for project-scoped roles. */
  projectEligible?: boolean
  /** When true, the select is disabled (e.g. waiting for project selection). */
  isDisabled?: boolean
}

const DEBOUNCE_MS = 300
const PAGE_SIZE = 50

export function PolicySelect({
  selected,
  onChange,
  hasError,
  scopeProjectId,
  projectEligible,
  isDisabled,
}: Readonly<PolicySelectProps>) {
  const [isOpen, setIsOpen] = useState(false)
  const [filterValue, setFilterValue] = useState('')
  const [debouncedFilter, setDebouncedFilter] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Debounce filter value for API calls
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedFilter(filterValue)
    }, DEBOUNCE_MS)
    return () => clearTimeout(debounceRef.current)
  }, [filterValue])

  const policiesQuery = accessClient.useQuery(
    'get',
    '/policies',
    {
      params: {
        query: {
          limit: PAGE_SIZE,
          'name[contains]': debouncedFilter || undefined,
          ...(scopeProjectId ? { project_id: scopeProjectId } : {}),
          ...(projectEligible ? { project_eligible: true } : {}),
        },
      },
    },
    { enabled: isOpen }
  )

  const policies = policiesQuery.data?.resources

  // Merge fetched policies with selected names so selected items always appear
  const policyOptions = useMemo(() => {
    const fetched = policies ?? []
    const fetchedNames = new Set(fetched.map((p) => p.name))
    const selectedOnly = selected.filter((name) => !fetchedNames.has(name))
    return [
      ...fetched.map((p) => ({ name: p.name, description: p.description })),
      ...selectedOnly.map((name) => ({ name, description: null })),
    ]
  }, [policies, selected])

  const filteredOptions = useMemo(() => {
    // Client-side filter for instant feedback while debounce hasn't fired yet
    if (filterValue && filterValue !== debouncedFilter) {
      const term = filterValue.toLowerCase()
      return policyOptions.filter((p) => p.name.toLowerCase().includes(term))
    }
    return policyOptions
  }, [policyOptions, filterValue, debouncedFilter])

  const onSelect = useCallback(
    (_event: React.MouseEvent<Element, MouseEvent> | undefined, value: string | number | undefined) => {
      const policyName = value as string
      if (selected.includes(policyName)) {
        onChange(selected.filter((p) => p !== policyName))
      } else {
        onChange([...selected, policyName])
      }
      setFilterValue('')
      inputRef.current?.focus()
    },
    [selected, onChange]
  )

  const removePolicy = useCallback(
    (policyName: string) => {
      onChange(selected.filter((p) => p !== policyName))
    },
    [selected, onChange]
  )

  const clearAll = useCallback(() => {
    onChange([])
    setFilterValue('')
  }, [onChange])

  const isLoading = policiesQuery.isLoading || policiesQuery.isFetching

  const toggle = (toggleRef: Ref<HTMLButtonElement>) => (
    <MenuToggle
      ref={toggleRef}
      variant="typeahead"
      onClick={() => setIsOpen(!isOpen)}
      isExpanded={isOpen}
      isFullWidth
      isDisabled={isDisabled}
      status={hasError ? 'danger' : undefined}
    >
      <TextInputGroup isPlain isDisabled={isDisabled}>
        <TextInputGroupMain
          value={filterValue}
          onChange={(_e, val) => {
            setFilterValue(val)
            if (!isOpen) setIsOpen(true)
          }}
          onClick={() => {
            if (!isOpen) setIsOpen(true)
          }}
          placeholder={selected.length === 0 ? 'Select policies...' : ''}
          autoComplete="off"
          innerRef={inputRef}
        >
          {selected.length > 0 && (
            <LabelGroup>
              {selected.map((name) => (
                <Label
                  key={name}
                  color="blue"
                  onClose={(e) => {
                    e.stopPropagation()
                    removePolicy(name)
                  }}
                >
                  {name}
                </Label>
              ))}
            </LabelGroup>
          )}
        </TextInputGroupMain>
        {selected.length > 0 && (
          <TextInputGroupUtilities>
            <Button
              variant="plain"
              onClick={(e) => {
                e.stopPropagation()
                clearAll()
              }}
              aria-label="Clear all selected policies"
            >
              <RhUiCloseIcon />
            </Button>
          </TextInputGroupUtilities>
        )}
      </TextInputGroup>
    </MenuToggle>
  )

  return (
    <Select
      id="role-policies"
      aria-label="Policies"
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      onSelect={onSelect}
      selected={selected}
      toggle={toggle}
    >
      <SelectList style={{ maxHeight: '200px', overflow: 'auto' }}>
        {isLoading && (
          <SelectOption isDisabled>
            <Spinner size="sm" /> Loading policies...
          </SelectOption>
        )}
        {!isLoading && filteredOptions.length === 0 && (
          <SelectOption isDisabled>
            {filterValue ? `No policies match "${filterValue}"` : 'No policies available'}
          </SelectOption>
        )}
        {!isLoading &&
          filteredOptions.map((policy) => (
            <SelectOption
              key={policy.name}
              value={policy.name}
              hasCheckbox
              isSelected={selected.includes(policy.name)}
              description={policy.description ?? undefined}
            >
              {policy.name}
            </SelectOption>
          ))}
      </SelectList>
    </Select>
  )
}
