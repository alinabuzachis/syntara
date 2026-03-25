import type { WorkflowAPI } from '@ansible/nexus-contracts'
import createFetchClient from 'openapi-fetch'

import type { FilterFieldDefinition } from '../../types/filters'
import { FilterTypeEnum } from '../../types/filters'

// Re-export shared filter change handler
export { createFilterChangeHandler } from '../../hooks/useFilterChangeHandler'

// Create a fetch client for async workflow queries
const workflowFetchClient = createFetchClient<WorkflowAPI.paths>({ baseUrl: '/api/v1/' })

/**
 * Transforms workflow resources into filter options
 * Exported for testing purposes
 * @internal
 */
export function transformWorkflowsToOptions(
  workflows: Array<{ id?: string | null; name?: string | null }>
): Array<{ value: string; label: string }> {
  return workflows
    .map((workflow) => ({
      value: workflow.id ?? '',
      label: workflow.name ?? '',
    }))
    .filter((opt) => opt.value && opt.label) // Filter out invalid entries
}

/**
 * Returns filter definition for filtering executions by workflow/automation with server-side typeahead
 *
 * @returns FilterFieldDefinition configured for workflow filtering with async SELECT type
 *
 * @remarks
 * Uses server-side typeahead via asyncOptions to support filtering by any workflow,
 * not just the first page of results. Queries /workflows with name[contains] parameter.
 *
 * @example
 * ```typescript
 * const filterDef = getExecutionWorkflowFilterDefinition()
 * // User types "deploy" → queries /workflows?name[contains]=deploy
 * // Generates query param: workflow_id=workflow-123
 * ```
 */
export const getExecutionWorkflowFilterDefinition = (): FilterFieldDefinition => ({
  key: 'workflow_id',
  label: 'Automation name',
  type: FilterTypeEnum.SELECT,
  asyncOptions: async (searchValue: string) => {
    const params: Record<string, unknown> = {
      limit: 50, // Show up to 50 matching workflows
    }

    // Add search filter if provided
    if (searchValue.trim()) {
      params['name[contains]'] = searchValue.trim()
    }

    try {
      const response = await workflowFetchClient.GET('/workflows', {
        params: { query: params },
      })

      const workflows = response.data?.resources ?? []
      return transformWorkflowsToOptions(workflows)
    } catch {
      // Failed to fetch workflows - return empty list
      return []
    }
  },
  placeholder: 'Search automations',
})

/**
 * Returns filter definition for filtering executions by status
 *
 * @returns FilterFieldDefinition configured for status filtering with SELECT type
 *
 * @remarks
 * Uses SELECT (single selection) instead of MULTISELECT because the backend API
 * does not currently support the status[in] operator for multiple status values.
 * When backend support is added, this can be changed to FilterTypeEnum.MULTISELECT
 * to allow filtering by multiple statuses at once.
 *
 * @example
 * ```typescript
 * const filterDef = getExecutionStatusFilterDefinition()
 * // Generates query param: status=completed
 * ```
 */
export const getExecutionStatusFilterDefinition = (): FilterFieldDefinition => ({
  key: 'status',
  label: 'Status',
  type: FilterTypeEnum.SELECT,
  options: [
    { value: 'pending', label: 'Pending' },
    { value: 'running', label: 'Running' },
    { value: 'completed', label: 'Completed' },
    { value: 'failed', label: 'Failed' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'timed_out', label: 'Timed Out' },
  ],
  placeholder: 'Filter by status',
})

/**
 * Returns filter definition for filtering executions by creation date range
 *
 * @returns null - Currently disabled due to backend limitation
 *
 * @remarks
 * **DISABLED DUE TO BACKEND LIMITATION**: The API currently uses OR logic instead of AND
 * for date range queries. For example:
 * - Query: `created_at[gte]=2026-03-16&created_at[lte]=2026-03-18`
 * - Current behavior: Returns executions BEFORE 2026-03-18 OR AFTER 2026-03-16 (incorrect)
 * - Expected behavior: Returns executions BETWEEN 2026-03-16 AND 2026-03-18 (correct)
 *
 * This filter is hidden until the backend bug is fixed. To re-enable after backend fix,
 * change return type to FilterFieldDefinition and uncomment the implementation below.
 *
 * @example
 * ```typescript
 * // When backend is fixed, uncomment:
 * // const filterDef = getExecutionCreatedAtFilterDefinition()
 * // Generates query params:
 * // created_at[gte]=2026-03-16T00:00:00.000Z
 * // created_at[lte]=2026-03-18T23:59:59.999Z
 * ```
 */
export const getExecutionCreatedAtFilterDefinition = (): null => {
  // Disabled due to backend OR logic bug - uncomment when fixed:
  // return {
  //   key: 'created_at',
  //   label: 'Created Date',
  //   type: FilterTypeEnum.DATERANGE,
  //   operators: [FilterOperatorEnum.GTE, FilterOperatorEnum.LTE],
  //   placeholder: 'Filter by creation date',
  // }
  return null
}
