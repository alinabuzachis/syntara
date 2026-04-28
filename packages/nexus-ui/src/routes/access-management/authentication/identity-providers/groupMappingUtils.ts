import type { IdentityProvidersAPI } from '@ansible/nexus-contracts'
import jmespath from 'jmespath'

const PROVIDER_TYPE_OIDC = 'oidc' as const

export type OIDCConfigurationResponse = IdentityProvidersAPI.components['schemas']['OIDCConfigurationResponse']
type IdentityProviderPatch = IdentityProvidersAPI.components['schemas']['IdentityProviderPatch']

export type GroupMappingEntry = {
  key: string
  idpGroupValue: string
  nexusGroupId: string
}

export type NexusGroup = {
  id?: string
  name?: string
  description?: string | null
}

export function nextKey(): string {
  return `entry-${crypto.randomUUID()}`
}

export function searchGroups(claims: Record<string, unknown>, expression: string): string[] {
  let result: unknown
  try {
    result = jmespath.search(claims, expression) as unknown
  } catch {
    return []
  }
  if (result == null) return []
  const items = Array.isArray(result) ? result : [result]
  return items.filter((v) => v != null).map((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
}

export type GroupMappingConfig = {
  group_jmespath_expression?: string | null
  group_mapping_entries?: { idp_group_value: string; nexus_group_id: string }[]
}

export function toFormEntries(config: GroupMappingConfig | null | undefined): GroupMappingEntry[] {
  if (!config?.group_mapping_entries) return []
  return config.group_mapping_entries.map((e) => ({
    key: nextKey(),
    idpGroupValue: e.idp_group_value,
    nexusGroupId: e.nexus_group_id,
  }))
}

export function buildSavePayload(
  providerConfig: OIDCConfigurationResponse,
  expression: string,
  entries: GroupMappingEntry[]
): IdentityProviderPatch {
  return {
    configuration: {
      ...providerConfig,
      provider_type: PROVIDER_TYPE_OIDC,
      issuer_url: providerConfig.issuer_url ?? '',
      client_id: providerConfig.client_id ?? '',
      redirect_uri: providerConfig.redirect_uri ?? '',
      group_jmespath_expression: expression,
      group_mapping_entries: entries
        .filter((e) => e.idpGroupValue && e.nexusGroupId)
        .map((e) => ({ idp_group_value: e.idpGroupValue, nexus_group_id: e.nexusGroupId })),
    },
  }
}

export function processDiscoveredGroups(
  claims: Record<string, unknown>,
  expression: string,
  entries: GroupMappingEntry[],
  nexusGroups: NexusGroup[]
): { newEntries: GroupMappingEntry[]; message: string; variant: 'success' | 'warning' } {
  const groups = searchGroups(claims, expression)

  if (groups.length === 0) {
    return {
      newEntries: entries,
      message:
        'No groups found. Check that the provider template is correct or adjust the Group Extraction Expression in Advanced settings.',
      variant: 'warning',
    }
  }

  const nexusGroupByName = new Map<string, string>()
  for (const g of nexusGroups) {
    if (g.name && g.id) nexusGroupByName.set(g.name, g.id)
  }

  const existingByValue = new Map<string, GroupMappingEntry>()
  for (const e of entries) {
    existingByValue.set(e.idpGroupValue, e)
  }

  const discoveredEntries = groups.map((g) => {
    const existing = existingByValue.get(g)
    if (existing) {
      existingByValue.delete(g)
      return existing
    }
    return { key: nextKey(), idpGroupValue: g, nexusGroupId: nexusGroupByName.get(g) ?? '' }
  })

  const newEntries = [...discoveredEntries, ...existingByValue.values()]
  const autoMatched = newEntries.filter((e) => e.nexusGroupId).length
  const message =
    autoMatched > 0
      ? `Discovered ${String(groups.length)} group(s). ${String(autoMatched)} matched to groups.`
      : `Discovered ${String(groups.length)} group(s).`

  return { newEntries, message, variant: 'success' }
}
