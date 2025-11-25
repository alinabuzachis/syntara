import type { Activity } from '@ansible/nexus-contracts'

interface EdgeConnection {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

/**
 * Generates edges from nested workflow structures.
 * This extracts edge relationships from then/else/branches arrays
 * and converts them to explicit edge objects.
 *
 * Called when loading a workflow to capture the structure as edges
 * before flattening the activities.
 *
 * @param activities - Array of activities (may have nested structures)
 * @returns Array of edge connections representing the workflow structure
 */
export function generateEdgesFromStructure(activities: Activity[]): EdgeConnection[] {
  const edges: EdgeConnection[] = []

  // Generate sequential edges between top-level activities
  for (let i = 0; i < activities.length - 1; i++) {
    const current = activities[i]
    const next = activities[i + 1]

    // Skip condition nodes - they have explicit branch edges
    if (current.type === 'condition') {
      continue
    }

    // Handle parallel_for_* wrappers - connect previous activity to each branch
    if (next.type === 'parallel' && next.id.startsWith('parallel_for_')) {
      const branches = next.branches || []
      branches.forEach((branch) => {
        edges.push({
          id: `${current.id}-${branch.id}`,
          source: current.id,
          target: branch.id,
          sourceHandle: 'source',
          targetHandle: 'target',
        })
      })
      continue
    }

    // Skip parallel_for_* wrappers as sources - their branches connect directly
    if (current.type === 'parallel' && current.id.startsWith('parallel_for_')) {
      continue
    }

    // Regular sequential edge
    edges.push({
      id: `${current.id}-${next.id}`,
      source: current.id,
      target: next.id,
      sourceHandle: 'source',
      targetHandle: 'target',
    })
  }

  for (const activity of activities) {
    if (activity.type === 'condition') {
      // Generate edges from condition's then/else branches
      const thenActivities = activity.then || []
      const elseActivities = activity.else || []

      // Create edge from condition to first activity in then branch
      if (thenActivities.length > 0) {
        const firstThen = thenActivities[0]
        // If first activity is a parallel_for_* wrapper, connect to its branches
        if (firstThen.type === 'parallel' && firstThen.id.startsWith('parallel_for_')) {
          const branches = firstThen.branches || []
          branches.forEach((branch) => {
            edges.push({
              id: `${activity.id}-${branch.id}`,
              source: activity.id,
              target: branch.id,
              sourceHandle: 'true',
              targetHandle: 'target',
            })
          })
        } else {
          // Regular activity - connect directly
          edges.push({
            id: `${activity.id}-${firstThen.id}`,
            source: activity.id,
            target: firstThen.id,
            sourceHandle: 'true',
            targetHandle: 'target',
          })
        }
      }

      // Create edge from condition to first activity in else branch
      if (elseActivities.length > 0) {
        const firstElse = elseActivities[0]
        // If first activity is a parallel_for_* wrapper, connect to its branches
        if (firstElse.type === 'parallel' && firstElse.id.startsWith('parallel_for_')) {
          const branches = firstElse.branches || []
          branches.forEach((branch) => {
            edges.push({
              id: `${activity.id}-${branch.id}`,
              source: activity.id,
              target: branch.id,
              sourceHandle: 'false',
              targetHandle: 'target',
            })
          })
        } else {
          // Regular activity - connect directly
          edges.push({
            id: `${activity.id}-${firstElse.id}`,
            source: activity.id,
            target: firstElse.id,
            sourceHandle: 'false',
            targetHandle: 'target',
          })
        }
      }

      // Generate sequential edges within then branch
      for (let i = 0; i < thenActivities.length - 1; i++) {
        const current = thenActivities[i]
        const next = thenActivities[i + 1]
        edges.push({
          id: `${current.id}-${next.id}`,
          source: current.id,
          target: next.id,
          sourceHandle: 'source',
          targetHandle: 'target',
        })
      }

      // Generate sequential edges within else branch
      for (let i = 0; i < elseActivities.length - 1; i++) {
        const current = elseActivities[i]
        const next = elseActivities[i + 1]
        edges.push({
          id: `${current.id}-${next.id}`,
          source: current.id,
          target: next.id,
          sourceHandle: 'source',
          targetHandle: 'target',
        })
      }

      // Recursively generate edges from nested activities
      edges.push(...generateEdgesFromStructure(thenActivities))
      edges.push(...generateEdgesFromStructure(elseActivities))
    } else if (activity.type === 'parallel') {
      // Handle parallel_for_* wrappers created by syncJoinBranches
      if (activity.id.startsWith('parallel_for_')) {
        // Extract join node ID from parallel wrapper ID
        const joinId = activity.id.replace('parallel_for_', '')
        const branches = activity.branches || []

        // Generate edges from each branch to the join node
        branches.forEach((branch) => {
          edges.push({
            id: `${branch.id}-${joinId}`,
            source: branch.id,
            target: joinId,
            sourceHandle: 'source',
            targetHandle: 'target',
          })
        })

        // Recursively generate edges from nested activities in each branch
        branches.forEach((branch) => {
          edges.push(...generateEdgesFromStructure([branch]))
        })
      } else {
        // Regular parallel activity (not auto-generated)
        const branches = activity.branches || []
        branches.forEach((branch) => {
          edges.push({
            id: `${activity.id}-${branch.id}`,
            source: activity.id,
            target: branch.id,
            sourceHandle: 'source',
            targetHandle: 'target',
          })
        })

        // Recursively generate edges from nested activities in each branch
        branches.forEach((branch) => {
          edges.push(...generateEdgesFromStructure([branch]))
        })
      }
    } else if (activity.type === 'sequence') {
      // Generate edges between sequential steps
      const steps = activity.steps || []
      for (let i = 0; i < steps.length - 1; i++) {
        const current = steps[i]
        const next = steps[i + 1]
        edges.push({
          id: `${current.id}-${next.id}`,
          source: current.id,
          target: next.id,
          sourceHandle: 'source',
          targetHandle: 'target',
        })
      }

      // Recursively generate edges from nested activities
      edges.push(...generateEdgesFromStructure(steps))
    } else if (activity.type === 'loop') {
      // Generate edges for loop body
      const doActivities = activity.loop.do || []
      if (doActivities.length > 0) {
        // Edge from loop to first activity in body
        edges.push({
          id: `${activity.id}-${doActivities[0].id}`,
          source: activity.id,
          target: doActivities[0].id,
          sourceHandle: 'source',
          targetHandle: 'target',
        })
      }

      // Recursively generate edges from nested activities
      edges.push(...generateEdgesFromStructure(doActivities))
    }
  }

  return edges
}
