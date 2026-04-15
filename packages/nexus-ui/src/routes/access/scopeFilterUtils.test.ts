import { describe, expect, it } from 'vitest'

import { FilterTypeEnum } from '../../types/filters'
import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'

import { buildFilterDefsWithScope, transformFiltersForApi } from './scopeFilterUtils'

describe('buildFilterDefsWithScope', () => {
  const baseDefs: FilterFieldDefinition[] = [
    { key: 'name', label: 'Name', type: FilterTypeEnum.TEXT },
    { key: 'scope', label: 'Scope', type: FilterTypeEnum.SELECT, options: [] },
  ]

  it('populates scope field options with system + projects', () => {
    const projectMap = new Map([
      ['p1', 'Alpha'],
      ['p2', 'Beta'],
    ])
    const result = buildFilterDefsWithScope(baseDefs, projectMap)

    const scopeDef = result.find((d) => d.key === 'scope')
    expect(scopeDef?.options).toEqual([
      { value: '__system__', label: 'System' },
      { value: 'p1', label: 'Alpha' },
      { value: 'p2', label: 'Beta' },
    ])
  })

  it('does not modify non-scope fields', () => {
    const result = buildFilterDefsWithScope(baseDefs, new Map())
    const nameDef = result.find((d) => d.key === 'name')
    expect(nameDef).toEqual(baseDefs[0])
  })
})

describe('transformFiltersForApi', () => {
  it('maps type=builtin to is_builtin=true', () => {
    const filters: FilterConfig[] = [{ key: 'type', value: 'builtin' }]
    expect(transformFiltersForApi(filters)).toEqual([{ key: 'is_builtin', value: true }])
  })

  it('maps type=custom to is_builtin=false', () => {
    const filters: FilterConfig[] = [{ key: 'type', value: 'custom' }]
    expect(transformFiltersForApi(filters)).toEqual([{ key: 'is_builtin', value: false }])
  })

  it('maps scope=__system__ to project_id with empty string', () => {
    const filters: FilterConfig[] = [{ key: 'scope', value: '__system__' }]
    expect(transformFiltersForApi(filters)).toEqual([{ key: 'project_id', value: '' }])
  })

  it('maps scope=project-id to project_id with that value', () => {
    const filters: FilterConfig[] = [{ key: 'scope', value: 'proj-123' }]
    expect(transformFiltersForApi(filters)).toEqual([{ key: 'project_id', value: 'proj-123' }])
  })

  it('passes through other filters unchanged', () => {
    const filters: FilterConfig[] = [{ key: 'name', value: 'test' }]
    expect(transformFiltersForApi(filters)).toEqual([{ key: 'name', value: 'test' }])
  })
})
