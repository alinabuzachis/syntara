/**
 * Central registration point for all node types
 * Import and call all registration functions here
 */

import { registerAAPNode } from './registerAAPNode'
import { registerActionNode } from './registerActionNode'
import { registerAIAgentNode } from './registerAIAgentNode'
import { registerApprovalNode } from './registerApprovalNode'
import { registerLogicNode } from './registerLogicNode'
import { registerTriggerNode } from './registerTriggerNode'

/**
 * Register all node types
 * Call this once during app initialization
 */
export function registerAllNodes() {
  registerTriggerNode()
  registerAIAgentNode()
  registerActionNode()
  registerAAPNode()
  registerLogicNode()
  registerApprovalNode()
}

// Re-export the registry for convenience
export { NodeRegistry } from '../NodeRegistry'
