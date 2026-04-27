/**
 * Filter operator enum for type-safe operator usage
 *
 * @example
 * ```typescript
 * import { FilterOperatorEnum } from '../types/filters'
 *
 * const filter: FilterConfig = {
 *   key: 'name',
 *   operator: FilterOperatorEnum.CONTAINS,
 *   value: 'deploy'
 * }
 * ```
 */
export const FilterOperatorEnum = {
  /** Exact match (name=value) */
  EQ: 'eq',
  /** Substring match (name[contains]=value) */
  CONTAINS: 'contains',
  /** Prefix match (name[starts_with]=value) */
  STARTS_WITH: 'starts_with',
  /** Greater than (created_at[gt]=2024-01-01) */
  GT: 'gt',
  /** Greater than or equal (created_at[gte]=2024-01-01) */
  GTE: 'gte',
  /** Less than (created_at[lt]=2024-12-31) */
  LT: 'lt',
  /** Less than or equal (created_at[lte]=2024-12-31) */
  LTE: 'lte',
  /** Multiple values (status[in]=running,failed) */
  IN: 'in',
} as const

/**
 * Filter operator type derived from FilterOperatorEnum
 *
 * @example
 * - 'eq': Exact match (name=value)
 * - 'contains': Substring match (name[contains]=value)
 * - 'starts_with': Prefix match (name[starts_with]=value)
 * - 'gt': Greater than (created_at[gt]=2024-01-01)
 * - 'gte': Greater than or equal (created_at[gte]=2024-01-01)
 * - 'lt': Less than (created_at[lt]=2024-12-31)
 * - 'lte': Less than or equal (created_at[lte]=2024-12-31)
 * - 'in': Multiple values (status[in]=running,failed)
 */
export type FilterOperator = (typeof FilterOperatorEnum)[keyof typeof FilterOperatorEnum]

/**
 * Supported filter value types
 */
export type FilterValue = string | boolean | number | Date | string[]

/**
 * Filter configuration used to build API query parameters
 *
 * @example
 * ```typescript
 * // Name contains "deploy"
 * { key: 'name', operator: 'contains', value: 'deploy' }
 * // → API param: name[contains]=deploy
 *
 * // Status is running or failed
 * { key: 'status', operator: 'in', value: ['running', 'failed'] }
 * // → API param: status[in]=running,failed
 *
 * // Created after 2024-01-01
 * { key: 'created_at', operator: 'gte', value: new Date('2024-01-01') }
 * // → API param: created_at[gte]=2024-01-01T00:00:00.000Z
 * ```
 */
export interface FilterConfig {
  /** API query parameter key (e.g., 'name', 'status', 'created_at') */
  key: string
  /** Filter operator - defaults to 'eq' if not specified */
  operator?: FilterOperator
  /** Filter value - type depends on field being filtered */
  value: FilterValue
}

/**
 * Filter type enum for type-safe filter type usage
 *
 * @example
 * ```typescript
 * import { FilterTypeEnum } from '../types/filters'
 *
 * const fieldDef: FilterFieldDefinition = {
 *   key: 'name',
 *   label: 'Name',
 *   type: FilterTypeEnum.TEXT,
 *   operators: [FilterOperatorEnum.CONTAINS]
 * }
 * ```
 */
export const FilterTypeEnum = {
  TEXT: 'text',
  SELECT: 'select',
  MULTISELECT: 'multiselect',
  DATE: 'date',
  DATERANGE: 'daterange',
  BOOLEAN: 'boolean',
  LABELS: 'labels',
} as const

/**
 * Filter type derived from FilterTypeEnum
 */
export type FilterType = (typeof FilterTypeEnum)[keyof typeof FilterTypeEnum]

/**
 * UI filter field definition for rendering filter controls
 *
 * @example
 * ```typescript
 * // Keyword search with default contains operator
 * {
 *   key: 'name',
 *   label: 'Keyword',
 *   type: FilterTypeEnum.TEXT,
 *   operators: [FilterOperatorEnum.CONTAINS, FilterOperatorEnum.STARTS_WITH],
 *   defaultOperator: FilterOperatorEnum.CONTAINS,
 *   placeholder: 'Filter by keyword'
 * }
 *
 * // Status multi-select
 * {
 *   key: 'status',
 *   label: 'Status',
 *   type: FilterTypeEnum.MULTISELECT,
 *   operators: [FilterOperatorEnum.IN],
 *   options: [
 *     { label: 'Running', value: 'running' },
 *     { label: 'Failed', value: 'failed' }
 *   ]
 * }
 *
 * // Async typeahead select
 * {
 *   key: 'workflow_id',
 *   label: 'Workflow',
 *   type: FilterTypeEnum.SELECT,
 *   asyncOptions: async (searchValue) => {
 *     const response = await fetch(`/workflows?name[contains]=${searchValue}`)
 *     return response.resources.map(w => ({ label: w.name, value: w.id }))
 *   },
 *   placeholder: 'Search workflows'
 * }
 * ```
 */
export interface FilterFieldDefinition {
  /** API parameter key - must match FilterConfig.key */
  key: string
  /** Display label for the filter control */
  label: string
  /** Filter control type */
  type: FilterType
  /** Allowed operators for this field - defaults to [FilterOperatorEnum.EQ] */
  operators?: FilterOperator[]
  /** Default operator for this field - used for keyword search (defaults to FilterOperatorEnum.EQ) */
  defaultOperator?: FilterOperator
  /** Options for select type filters (static) */
  options?: { label: string; value: string }[]
  /** Async function to fetch options based on search value (for server-side typeahead) */
  asyncOptions?: (searchValue: string) => Promise<{ label: string; value: string }[]>
  /** Function to resolve a value to its display label (for async filters with stored values) */
  getOptionLabel?: (value: string) => string | undefined
  /** Callback when an option is selected (useful for caching async option labels) */
  onOptionSelected?: (value: string, label: string) => void
  /** Placeholder text for input controls */
  placeholder?: string
}

/**
 * Helper to get all valid filter operator values
 */
export const VALID_FILTER_OPERATORS = Object.values(FilterOperatorEnum) as FilterOperator[]

/**
 * Helper to get all valid filter type values
 */
export const VALID_FILTER_TYPES = Object.values(FilterTypeEnum) as FilterType[]

/**
 * Helper to check if a string is a valid filter operator
 */
export function isValidFilterOperator(operator: string): operator is FilterOperator {
  return VALID_FILTER_OPERATORS.includes(operator as FilterOperator)
}

/**
 * Helper to check if a string is a valid filter type
 */
export function isValidFilterType(type: string): type is FilterType {
  return VALID_FILTER_TYPES.includes(type as FilterType)
}
