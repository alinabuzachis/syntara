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
import { type Ref, useCallback, useMemo, useRef, useState } from 'react'

import { accessClient } from '../../access/accessClient'

type ProjectPolicySelectProps = {
  projectId: string
  selected: string[]
  onChange: (selected: string[]) => void
  hasError?: boolean
}

const PAGE_SIZE = 50

export function ProjectPolicySelect({ projectId, selected, onChange, hasError }: Readonly<ProjectPolicySelectProps>) {
  const [isOpen, setIsOpen] = useState(false)
  const [filterValue, setFilterValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const policiesQuery = accessClient.useQuery(
    'get',
    '/projects/{project_id}/policies',
    {
      params: {
        path: { project_id: projectId },
        query: { limit: PAGE_SIZE },
      },
    },
    { enabled: isOpen }
  )

  const policies = policiesQuery.data?.resources

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
    if (filterValue) {
      const term = filterValue.toLowerCase()
      return policyOptions.filter((p) => p.name.toLowerCase().includes(term))
    }
    return policyOptions
  }, [policyOptions, filterValue])

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
      data-testid="policy-select-toggle"
      variant="typeahead"
      onClick={() => setIsOpen(!isOpen)}
      isExpanded={isOpen}
      isFullWidth
      status={hasError ? 'danger' : undefined}
    >
      <TextInputGroup isPlain>
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
      id="project-role-policies"
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
