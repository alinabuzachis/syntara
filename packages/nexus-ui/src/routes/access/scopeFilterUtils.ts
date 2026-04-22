import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'
import { FilterTypeEnum } from '../../types/filters'

/** Sentinel value used in scope filter to represent system-scoped items (no project) */
export const SYSTEM_SCOPE_VALUE = '__system__'

/**
 * Builds scope filter field definitions with dynamic project options.
 * Returns a new array with the scope field's options populated from the project name map.
 */
export function buildFilterDefsWithScope(
  baseDefs: FilterFieldDefinition[],
  projectNameMap: Map<string, string>
): FilterFieldDefinition[] {
  const projectOptions = Array.from(projectNameMap.entries()).map(([id, name]) => ({
    value: id,
    label: name,
  }))

  return baseDefs.map((def) => {
    if (def.key === 'scope' && def.type === FilterTypeEnum.SELECT) {
      return { ...def, options: [{ value: SYSTEM_SCOPE_VALUE, label: 'System' }, ...projectOptions] }
    }
    return def
  })
}

/**
 * Transforms UI filter configs into API-compatible filter configs.
 * - Maps `type` filter to `is_builtin`
 * - Maps `scope` filter to `project_id`
 */
export function transformFiltersForApi(filters: FilterConfig[]): FilterConfig[] {
  return filters.map((f) => {
    if (f.key === 'type') {
      return { key: 'is_builtin', value: f.value === 'builtin' }
    }
    if (f.key === 'scope') {
      // System scope: empty string signals "no project_id"
      if (f.value === SYSTEM_SCOPE_VALUE) {
        return { key: 'project_id', value: '' }
      }
      return { key: 'project_id', value: f.value }
    }
    return f
  })
}
