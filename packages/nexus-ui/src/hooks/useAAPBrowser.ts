import type { AAPAPI } from '@ansible/nexus-contracts'
import { useCallback, useState } from 'react'

import { aapClient } from '../client'
import { detachPromise } from '../utils/detachPromise'
import { sanitizeSearchInput } from '../utils/searchSanitization'

export type AAPOrganization = AAPAPI.components['schemas']['AAPOrganization']
export type AAPJobTemplate = AAPAPI.components['schemas']['AAPJobTemplate']
export type AAPJobTemplateDetail = AAPAPI.components['schemas']['AAPJobTemplateDetail']
export type AAPInventory = AAPAPI.components['schemas']['AAPInventory']
export type AAPExecutionEnvironment = AAPAPI.components['schemas']['AAPExecutionEnvironment']
export type AAPCredential = AAPAPI.components['schemas']['AAPCredential']
export type AAPInstanceGroup = AAPAPI.components['schemas']['AAPInstanceGroup']
export type AAPLabel = AAPAPI.components['schemas']['AAPLabel']

type AAPSearchState = {
  selectedOrg: string
  selectedTemplateId: number | undefined
  orgSearch: string
  templateSearch: string
  inventorySearch: string
  execEnvSearch: string
  credentialSearch: string
  instanceGroupSearch: string
  labelSearch: string
}

const INITIAL_STATE: AAPSearchState = {
  selectedOrg: '',
  selectedTemplateId: undefined,
  orgSearch: '',
  templateSearch: '',
  inventorySearch: '',
  execEnvSearch: '',
  credentialSearch: '',
  instanceGroupSearch: '',
  labelSearch: '',
}

export type AAPBrowserInitialState = {
  readonly organization?: string
  readonly jobTemplateId?: number
}

/** AAP Controller defaults to page_size=25; request more to populate full dropdowns */
const AAP_DROPDOWN_PAGE_SIZE = 200

function getFirstError(...errors: (Error | Record<string, unknown> | null)[]): Error | null {
  for (const err of errors) {
    if (err) return err instanceof Error ? err : new Error(JSON.stringify(err))
  }
  return null
}

/** Extract results array from a query, defaulting to empty array. */
function resultsOf<T>(query: { data?: { results?: T[] } }): T[] {
  return query.data?.results ?? []
}

/** Build common query params for AAP resource searches */
function buildSearchParams(search: string, credentialId: string | undefined, organization?: string) {
  return {
    search: search ? sanitizeSearchInput(search) : undefined,
    page_size: AAP_DROPDOWN_PAGE_SIZE,
    credential_id: credentialId || undefined,
    organization: organization || undefined,
  }
}

function useAAPQueries(state: AAPSearchState, isActive: boolean, credentialId: string | undefined) {
  const orgsQuery = aapClient.useQuery(
    'get',
    '/aap/organizations',
    { params: { query: buildSearchParams(state.orgSearch, credentialId) } },
    { enabled: isActive }
  )

  const templatesQuery = aapClient.useQuery(
    'get',
    '/aap/job-templates',
    { params: { query: buildSearchParams(state.templateSearch, credentialId, state.selectedOrg) } },
    { enabled: isActive }
  )

  const inventoriesQuery = aapClient.useQuery(
    'get',
    '/aap/inventories',
    { params: { query: buildSearchParams(state.inventorySearch, credentialId, state.selectedOrg) } },
    { enabled: isActive }
  )

  const templateDetailQuery = aapClient.useQuery(
    'get',
    '/aap/job-templates/{job_template_id}',
    {
      params: {
        path: { job_template_id: state.selectedTemplateId ?? 0 },
        query: { credential_id: credentialId || undefined },
      },
    },
    { enabled: isActive && state.selectedTemplateId != null }
  )

  const execEnvsQuery = aapClient.useQuery(
    'get',
    '/aap/execution-environments',
    { params: { query: buildSearchParams(state.execEnvSearch, credentialId, state.selectedOrg) } },
    { enabled: isActive }
  )

  const credentialsQuery = aapClient.useQuery(
    'get',
    '/aap/credentials',
    { params: { query: buildSearchParams(state.credentialSearch, credentialId) } },
    { enabled: isActive }
  )

  const instanceGroupsQuery = aapClient.useQuery(
    'get',
    '/aap/instance-groups',
    { params: { query: buildSearchParams(state.instanceGroupSearch, credentialId) } },
    { enabled: isActive }
  )

  const labelsQuery = aapClient.useQuery(
    'get',
    '/aap/labels',
    { params: { query: buildSearchParams(state.labelSearch, credentialId, state.selectedOrg) } },
    { enabled: isActive }
  )

  return {
    orgsQuery,
    templatesQuery,
    inventoriesQuery,
    templateDetailQuery,
    execEnvsQuery,
    credentialsQuery,
    instanceGroupsQuery,
    labelsQuery,
  }
}

function useAAPActions(setState: React.Dispatch<React.SetStateAction<AAPSearchState>>) {
  const selectOrganization = useCallback(
    (orgName: string) => {
      setState((prev) => ({
        ...prev,
        selectedOrg: orgName,
        selectedTemplateId: undefined,
        templateSearch: '',
        inventorySearch: '',
        execEnvSearch: '',
        labelSearch: '',
      }))
    },
    [setState]
  )

  const selectJobTemplate = useCallback(
    (templateId: number | undefined) => {
      setState((prev) => ({ ...prev, selectedTemplateId: templateId }))
    },
    [setState]
  )

  const resetAll = useCallback(() => {
    setState(INITIAL_STATE)
  }, [setState])

  const searchOrganizations = useCallback((s: string) => setState((prev) => ({ ...prev, orgSearch: s })), [setState])
  const searchJobTemplates = useCallback(
    (s: string) => setState((prev) => ({ ...prev, templateSearch: s })),
    [setState]
  )
  const searchInventories = useCallback(
    (s: string) => setState((prev) => ({ ...prev, inventorySearch: s })),
    [setState]
  )
  const searchExecutionEnvironments = useCallback(
    (s: string) => setState((prev) => ({ ...prev, execEnvSearch: s })),
    [setState]
  )
  const searchCredentials = useCallback(
    (s: string) => setState((prev) => ({ ...prev, credentialSearch: s })),
    [setState]
  )
  const searchInstanceGroups = useCallback(
    (s: string) => setState((prev) => ({ ...prev, instanceGroupSearch: s })),
    [setState]
  )
  const searchLabels = useCallback((s: string) => setState((prev) => ({ ...prev, labelSearch: s })), [setState])

  return {
    selectOrganization,
    selectJobTemplate,
    resetAll,
    searchOrganizations,
    searchJobTemplates,
    searchInventories,
    searchExecutionEnvironments,
    searchCredentials,
    searchInstanceGroups,
    searchLabels,
  }
}

function useAAPBrowserResults(
  queries: ReturnType<typeof useAAPQueries>,
  isActive: boolean,
  selectedTemplateId: number | undefined
) {
  return {
    organizations: resultsOf(queries.orgsQuery),
    jobTemplates: resultsOf(queries.templatesQuery),
    inventories: resultsOf(queries.inventoriesQuery),
    executionEnvironments: resultsOf(queries.execEnvsQuery),
    credentials: resultsOf(queries.credentialsQuery),
    instanceGroups: resultsOf(queries.instanceGroupsQuery),
    labels: resultsOf(queries.labelsQuery),
    templateDetail: queries.templateDetailQuery.data ?? undefined,
    loadingOrgs: queries.orgsQuery.isPending && isActive,
    loadingTemplates: queries.templatesQuery.isPending && isActive,
    loadingInventories: queries.inventoriesQuery.isPending && isActive,
    loadingExecutionEnvironments: queries.execEnvsQuery.isPending && isActive,
    loadingCredentials: queries.credentialsQuery.isPending && isActive,
    loadingInstanceGroups: queries.instanceGroupsQuery.isPending && isActive,
    loadingLabels: queries.labelsQuery.isPending && isActive,
    loadingTemplateDetail: queries.templateDetailQuery.isPending && selectedTemplateId != null,
    error: getFirstError(
      queries.orgsQuery.error,
      queries.templatesQuery.error,
      queries.inventoriesQuery.error,
      queries.templateDetailQuery.error,
      queries.execEnvsQuery.error,
      queries.credentialsQuery.error,
      queries.instanceGroupsQuery.error,
      queries.labelsQuery.error
    ),
  }
}

/**
 * Hook to browse AAP resources (organizations, job templates, inventories,
 * execution environments, credentials, instance groups) via the Nexus backend proxy.
 *
 * When credentialId is provided, the hook fetches organizations
 * on mount. When an organization is selected, it re-fetches
 * resources filtered by that org.
 */
export function useAAPBrowser(credentialId: string | undefined, initialState?: AAPBrowserInitialState) {
  const [state, setState] = useState<AAPSearchState>(() => ({
    ...INITIAL_STATE,
    selectedOrg: initialState?.organization ?? '',
    selectedTemplateId: initialState?.jobTemplateId,
  }))
  const isActive = credentialId !== undefined

  const queries = useAAPQueries(state, isActive, credentialId)
  const actions = useAAPActions(setState)

  const retryAll = useCallback(() => {
    const allQueries = [
      queries.orgsQuery,
      queries.templatesQuery,
      queries.inventoriesQuery,
      queries.templateDetailQuery,
      queries.execEnvsQuery,
      queries.credentialsQuery,
      queries.instanceGroupsQuery,
      queries.labelsQuery,
    ]
    detachPromise(Promise.all(allQueries.map((q) => q.refetch())))
  }, [
    queries.orgsQuery,
    queries.templatesQuery,
    queries.inventoriesQuery,
    queries.templateDetailQuery,
    queries.execEnvsQuery,
    queries.credentialsQuery,
    queries.instanceGroupsQuery,
    queries.labelsQuery,
  ])

  return {
    ...useAAPBrowserResults(queries, isActive, state.selectedTemplateId),
    selectedOrg: state.selectedOrg,
    ...actions,
    retryAll,
  }
}
