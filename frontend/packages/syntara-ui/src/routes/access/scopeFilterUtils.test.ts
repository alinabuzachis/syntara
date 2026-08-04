import { describe, expect, it } from 'vitest'

import { FilterTypeEnum } from '../../types/filters'
import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'

import { buildFilterDefsWithScope, buildProjectFilterDefs, transformFiltersForApi } from './scopeFilterUtils'

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

describe('buildProjectFilterDefs', () => {
  const baseDefs: FilterFieldDefinition[] = [
    { key: 'name', label: 'Name', type: FilterTypeEnum.TEXT },
    { key: 'project', label: 'Project', type: FilterTypeEnum.SELECT, options: [] },
  ]

  it('populates project field options from project map', () => {
    const projectMap = new Map([
      ['p1', 'Alpha'],
      ['p2', 'Beta'],
    ])
    const result = buildProjectFilterDefs(baseDefs, projectMap)

    const projectDef = result.find((d) => d.key === 'project')
    expect(projectDef?.options).toEqual([
      { value: 'p1', label: 'Alpha' },
      { value: 'p2', label: 'Beta' },
    ])
  })

  it('does not modify non-project fields', () => {
    const result = buildProjectFilterDefs(baseDefs, new Map())
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

  it('passes scope filter through unchanged', () => {
    const filters: FilterConfig[] = [{ key: 'scope', value: 'project' }]
    expect(transformFiltersForApi(filters)).toEqual([{ key: 'scope', value: 'project' }])
  })

  it('maps project filter to project_id', () => {
    const filters: FilterConfig[] = [{ key: 'project', value: 'proj-123' }]
    expect(transformFiltersForApi(filters)).toEqual([{ key: 'project_id', value: 'proj-123' }])
  })

  it('passes through other filters unchanged', () => {
    const filters: FilterConfig[] = [{ key: 'name', value: 'test' }]
    expect(transformFiltersForApi(filters)).toEqual([{ key: 'name', value: 'test' }])
  })
})
