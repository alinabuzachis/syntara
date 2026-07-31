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

  it('defines state as SELECT in the attribute search with Draft and Published options', () => {
    const stateFilter = workflowFilterDefinitions.find((field) => field.key === 'is_enabled')

    expect(stateFilter).toMatchObject({
      key: 'is_enabled',
      label: 'State',
      type: FilterTypeEnum.SELECT,
      placeholder: 'Filter by state',
    })
    expect(stateFilter?.options).toEqual([
      { value: 'false', label: 'Draft' },
      {
        value: 'true',
        label: 'Published',
        description: 'Includes workflows showing as Published or Unpublished changes',
      },
    ])
  })
})

describe('transformIsEnabledFilter', () => {
  it('converts a single is_enabled string to boolean', () => {
    expect(transformIsEnabledFilter([{ key: 'is_enabled', operator: 'eq', value: 'true' }])).toEqual([
      { key: 'is_enabled', operator: 'eq', value: true },
    ])
  })

  it('converts is_enabled false string to boolean', () => {
    expect(transformIsEnabledFilter([{ key: 'is_enabled', operator: 'eq', value: 'false' }])).toEqual([
      { key: 'is_enabled', operator: 'eq', value: false },
    ])
  })

  it('leaves other filters unchanged', () => {
    const filters = [{ key: 'name', operator: 'contains' as const, value: 'deploy' }]
    expect(transformIsEnabledFilter(filters)).toEqual(filters)
  })
})
