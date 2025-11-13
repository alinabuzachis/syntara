/**
 * Central registration point for all node types
 * Import and call all registration functions here
 */

import { registerTriggerNode } from './registerTriggerNode'
import { registerActionNode } from './registerActionNode'
import { registerAIAgentNode } from './registerAIAgentNode'
import { registerLogicNode } from './registerLogicNode'
import { registerAAPNode } from './registerAAPNode'
import { registerApprovalNode } from './registerApprovalNode'

/**
 * Register all node types
 * Call this once during app initialization
 */
export function registerAllNodes() {
  registerTriggerNode()
  registerAIAgentNode()
  registerActionNode()
  registerLogicNode()
  registerApprovalNode()
  registerAAPNode()
}

// Re-export the registry for convenience
export { NodeRegistry } from '../NodeRegistry'
