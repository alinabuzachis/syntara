import { describe, expect, it } from 'vitest'

import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'

import { transformIsEnabledFilter, workflowFilterDefinitions } from './workflowFilterDefinitions'

describe('workflowFilterDefinitions', () => {
  it('defines name text filter with contains', () => {
    const nameFilter = workflowFilterDefinitions.find((field) => field.key === 'name')

    expect(nameFilter).toMatchObject({
      type: FilterTypeEnum.TEXT,
      operators: [FilterOperatorEnum.CONTAINS],
      defaultOperator: FilterOperatorEnum.CONTAINS,
    })
  })

  it('defines state as MULTISELECT with IN for combined enabled/disabled filtering', () => {
    const stateFilter = workflowFilterDefinitions.find((field) => field.key === 'is_enabled')

    expect(stateFilter).toMatchObject({
      key: 'is_enabled',
      label: 'State',
      type: FilterTypeEnum.MULTISELECT,
      operators: [FilterOperatorEnum.IN],
      defaultOperator: FilterOperatorEnum.IN,
      placeholder: 'Filter by state',
    })
    expect(stateFilter?.options).toEqual([
      { value: 'true', label: 'Enabled' },
      { value: 'false', label: 'Disabled' },
    ])
  })
})

describe('transformIsEnabledFilter', () => {
  it('converts a single is_enabled string to boolean', () => {
    expect(transformIsEnabledFilter([{ key: 'is_enabled', operator: 'eq', value: 'true' }])).toEqual([
      { key: 'is_enabled', operator: 'eq', value: true },
    ])
  })

  it('leaves is_enabled string arrays unchanged for IN filters', () => {
    const filters = [{ key: 'is_enabled', operator: 'in' as const, value: ['true', 'false'] }]
    expect(transformIsEnabledFilter(filters)).toEqual(filters)
  })

  it('leaves other filters unchanged', () => {
    const filters = [{ key: 'name', operator: 'contains' as const, value: 'deploy' }]
    expect(transformIsEnabledFilter(filters)).toEqual(filters)
  })
})
