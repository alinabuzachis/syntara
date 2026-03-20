import type { ValueOf } from './types'

/**
 * Node type and subtype identifiers for the builder NodeRegistry (Add node panel).
 * Use these constants instead of string literals when comparing or registering registry ids.
 *
 * @example
 * import { RegistryNodeId } from '@/constants/registryNodeIds'
 *
 * if (nodeTypeId === RegistryNodeId.TRIGGER) { ... }
 * NodeRegistry.register({ id: RegistryNodeId.ACTION, ... })
 */
export const RegistryNodeId = {
  TRIGGER: 'trigger',
  TRIGGER_MANUAL: 'trigger-manual',
  TRIGGER_SCHEDULED: 'trigger-scheduled',
  ACTION: 'action',
  ACTION_SCRIPT: 'action-script',
  ACTION_API: 'action-api',
  APPROVAL: 'approval',
  LOGIC: 'logic',
  LOGIC_CONDITION: 'logic-condition',
  LOGIC_CONVERGE: 'logic-converge',
  LOGIC_LOOP: 'logic-loop',
  AGENT: 'agent',
  AAP: 'aap',
  GENERIC: 'generic',
} as const

/** Union of registry node id values */
export type RegistryNodeIdUnion = ValueOf<typeof RegistryNodeId>
