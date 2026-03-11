import { EdgeHandleEnum, type Activity } from '@ansible/nexus-contracts'

import type { EdgeConnection } from '../../workflowTransform'
import type { ValidationError } from '../types'

/**
 * Information about a condition branch in the trace
 */
interface ConditionBranchInfo {
  conditionId: string
  conditionName: string
  branch: 'then' | 'else'
}

function addConditionBranch(
  conditionBranches: Map<string, Set<'then' | 'else'>>,
  conditionId: string,
  branch: 'then' | 'else'
): void {
  if (!conditionBranches.has(conditionId)) {
    conditionBranches.set(conditionId, new Set())
  }
  conditionBranches.get(conditionId)!.add(branch)
}

/**
 * Traces backwards from a node to find all condition branches it originates from.
 *
 * This recursively follows edges backwards until reaching:
 * - A condition node (record which branch was taken)
 * - A node with no incoming edges (entry point)
 * - A node already visited (cycle detection)
 */
function traceToConditions(
  nodeId: string,
  edges: EdgeConnection[],
  activities: Activity[],
  visited: Set<string> = new Set()
): ConditionBranchInfo[] {
  // Prevent infinite loops
  if (visited.has(nodeId)) {
    return []
  }
  visited.add(nodeId)

  const results: ConditionBranchInfo[] = []

  // Find all incoming edges to this node
  const incomingEdges = edges.filter((e) => e.target === nodeId)

  for (const edge of incomingEdges) {
    const sourceNode = activities.find((a) => a.id === edge.source)
    if (!sourceNode) continue

    // If source is a condition node, record which branch we came from
    if (sourceNode.type === 'condition') {
      const branch =
        edge.sourceHandle === EdgeHandleEnum.TRUE ? 'then' : edge.sourceHandle === EdgeHandleEnum.FALSE ? 'else' : null
      if (branch) {
        results.push({
          conditionId: sourceNode.id,
          conditionName: sourceNode.name ?? sourceNode.id,
          branch,
        })
      }
    }

    // Continue tracing backwards from the source node
    const upstreamConditions = traceToConditions(edge.source, edges, activities, visited)
    results.push(...upstreamConditions)
  }

  return results
}

/**
 * Validates that converge nodes don't receive inputs from both branches of the same condition.
 *
 * If a converge node receives inputs from both the 'then' and 'else' branches of the same
 * condition, it creates logical ambiguity - the converge will always execute regardless of
 * which branch was taken, defeating the purpose of conditional logic.
 *
 * Example of INVALID flow:
 *   Condition A
 *     ├─ Then → Task B ──┐
 *     └─ Else → Task C ──┴─→ Converge D  ❌ Invalid!
 *
 * Example of VALID flow:
 *   Condition A
 *     ├─ Then → Task B → Task E
 *     └─ Else → Task C → Task F
 *   Task E ──┐
 *   Task F ──┴─→ Converge G  ✅ Valid (different conditions)
 */
export function validateConvergeInputs(activities: Activity[], edges: EdgeConnection[]): ValidationError[] {
  const errors: ValidationError[] = []

  // Find all converge nodes
  const convergeNodes = activities.filter((a) => a.type === 'converge')

  for (const converge of convergeNodes) {
    // Find all incoming edges to this converge
    const incomingEdges = edges.filter((e) => e.target === converge.id)

    // For each incoming edge, trace back to find condition branches
    const conditionBranches = new Map<string, Set<'then' | 'else'>>()

    for (const edge of incomingEdges) {
      // First check if the direct source is a condition node
      const sourceNode = activities.find((a) => a.id === edge.source)
      if (sourceNode?.type === 'condition') {
        const branch =
          edge.sourceHandle === EdgeHandleEnum.TRUE
            ? 'then'
            : edge.sourceHandle === EdgeHandleEnum.FALSE
              ? 'else'
              : null
        if (branch) {
          addConditionBranch(conditionBranches, sourceNode.id, branch)
        }
      }

      // Then trace backwards to find upstream conditions
      const conditions = traceToConditions(edge.source, edges, activities)

      // Group by condition ID
      for (const condInfo of conditions) {
        addConditionBranch(conditionBranches, condInfo.conditionId, condInfo.branch)
      }
    }

    // Check if any condition has both 'then' and 'else' branches converging
    for (const [conditionId, branches] of conditionBranches.entries()) {
      if (branches.has('then') && branches.has('else')) {
        // Find the condition node to get its name
        const conditionNode = activities.find((a) => a.id === conditionId)
        const conditionName = conditionNode?.name ?? conditionId

        errors.push({
          id: `converge-same-condition-${converge.id}-${conditionId}`,
          severity: 'error',
          rule: 'converge-inputs',
          message: `Converge "${converge.name ?? converge.id}" receives inputs from both 'Then' and 'Else' branches of condition "${conditionName}". This creates ambiguous execution flow.`,
          nodeIds: [converge.id, conditionId],
          suggestion:
            'Restructure the workflow so that only one branch of the condition leads to this converge node. ' +
            'If you need both branches to eventually meet, add intermediate nodes and converge at a point ' +
            'where the branches come from different conditions.',
        })
      }
    }
  }

  return errors
}
