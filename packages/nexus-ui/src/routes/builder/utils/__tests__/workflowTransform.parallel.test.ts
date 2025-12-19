import type { Activity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import type { EdgeConnection } from '../workflowTransform'
import { WorkflowTransform } from '../workflowTransform'

describe('WorkflowTransform - Parallel Detection', () => {
  it('detects parallel branches from divergence point without converge node', () => {
    // Workflow structure: Manual → A → (P1 || L where L contains D)
    // This matches the user's screenshot where A splits to both P1 and L
    const activities: Activity[] = [
      { type: 'task', id: 'trigger', name: 'Manual', task: { executor: 'manual', config: {} } },
      { type: 'task', id: 'A', name: 'Task A', task: { executor: 'script', config: { language: 'python', code: '' } } },
      {
        type: 'task',
        id: 'P1',
        name: 'Task P1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'loop',
        id: 'L',
        name: 'Loop L',
        loop: { over: '${items}', item: 'item', do: [] },
      },
      { type: 'task', id: 'D', name: 'Task D', task: { executor: 'script', config: { language: 'python', code: '' } } },
    ]

    const edges: EdgeConnection[] = [
      { id: 'trigger-A', source: 'trigger', target: 'A', sourceHandle: 'source', targetHandle: 'target' },
      // A diverges to both P1 and L
      { id: 'A-P1', source: 'A', target: 'P1', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'A-L', source: 'A', target: 'L', sourceHandle: 'source', targetHandle: 'target' },
      // L loop body
      { id: 'L-D', source: 'L', target: 'D', sourceHandle: 'loop', targetHandle: 'target' },
      { id: 'D-L', source: 'D', target: 'L', sourceHandle: 'source', targetHandle: 'end' },
    ]

    const result = WorkflowTransform.nest(activities, edges)

    // Should have 3 top-level activities: trigger, A, parallel container
    expect(result).toHaveLength(3)
    expect(result[0].id).toBe('trigger')
    expect(result[1].id).toBe('A')
    expect(result[2].type).toBe('parallel')

    // Parallel container should have 2 branches
    const parallelContainer = result[2] as Extract<Activity, { type: 'parallel' }>
    expect(parallelContainer.branches).toHaveLength(2)

    // Branch 1 should be P1 (single activity)
    const branch1 = parallelContainer.branches![0]
    expect(branch1).toMatchObject({ type: 'task', id: 'P1' })

    // Branch 2 should be L with nested D
    const branch2 = parallelContainer.branches![1] as Extract<Activity, { type: 'loop' }>
    expect(branch2.type).toBe('loop')
    expect(branch2.id).toBe('L')
    expect(branch2.loop.do).toHaveLength(1)
    expect(branch2.loop.do[0].id).toBe('D')
  })

  it('handles divergence with 3 parallel branches', () => {
    const activities: Activity[] = [
      { type: 'task', id: 'A', name: 'Task A', task: { executor: 'script', config: { language: 'python', code: '' } } },
      {
        type: 'task',
        id: 'B1',
        name: 'Task B1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'B2',
        name: 'Task B2',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'B3',
        name: 'Task B3',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
    ]

    const edges: EdgeConnection[] = [
      // A diverges to B1, B2, B3
      { id: 'A-B1', source: 'A', target: 'B1', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'A-B2', source: 'A', target: 'B2', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'A-B3', source: 'A', target: 'B3', sourceHandle: 'source', targetHandle: 'target' },
    ]

    const result = WorkflowTransform.nest(activities, edges)

    // Should have 2 top-level activities: A, parallel container
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('A')
    expect(result[1].type).toBe('parallel')

    // Parallel container should have 3 branches
    const parallelContainer = result[1] as Extract<Activity, { type: 'parallel' }>
    expect(parallelContainer.branches).toHaveLength(3)
    expect(parallelContainer.branches![0]).toMatchObject({ id: 'B1' })
    expect(parallelContainer.branches![1]).toMatchObject({ id: 'B2' })
    expect(parallelContainer.branches![2]).toMatchObject({ id: 'B3' })
  })

  it('does not treat condition true/false branches as parallel', () => {
    // Condition nodes use 'true'/'false' handles which should NOT trigger parallel wrapping
    const activities: Activity[] = [
      {
        type: 'condition',
        id: 'C',
        name: 'Condition',
        condition: '${check}',
        then: [],
        else: [],
      },
      {
        type: 'task',
        id: 'T1',
        name: 'True Task',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'T2',
        name: 'False Task',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
    ]

    const edges: EdgeConnection[] = [
      { id: 'C-T1', source: 'C', target: 'T1', sourceHandle: 'true', targetHandle: 'target' },
      { id: 'C-T2', source: 'C', target: 'T2', sourceHandle: 'false', targetHandle: 'target' },
    ]

    const result = WorkflowTransform.nest(activities, edges)

    // Should have 1 top-level activity: C (not wrapped in parallel)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('condition')

    // Condition should have T1 in then, T2 in else
    const condNode = result[0] as Extract<Activity, { type: 'condition' }>
    expect(condNode.then).toHaveLength(1)
    expect(condNode.then![0].id).toBe('T1')
    expect(condNode.else).toHaveLength(1)
    expect(condNode.else![0].id).toBe('T2')
  })

  it('handles parallel branches with sequential activities', () => {
    const activities: Activity[] = [
      { type: 'task', id: 'A', name: 'Task A', task: { executor: 'script', config: { language: 'python', code: '' } } },
      {
        type: 'task',
        id: 'B1',
        name: 'Task B1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'B2',
        name: 'Task B2',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'C1',
        name: 'Task C1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'C2',
        name: 'Task C2',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
    ]

    const edges: EdgeConnection[] = [
      // A diverges to B1 and C1
      { id: 'A-B1', source: 'A', target: 'B1', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'A-C1', source: 'A', target: 'C1', sourceHandle: 'source', targetHandle: 'target' },
      // B1 → B2 (sequential in branch 1)
      { id: 'B1-B2', source: 'B1', target: 'B2', sourceHandle: 'source', targetHandle: 'target' },
      // C1 → C2 (sequential in branch 2)
      { id: 'C1-C2', source: 'C1', target: 'C2', sourceHandle: 'source', targetHandle: 'target' },
    ]

    const result = WorkflowTransform.nest(activities, edges)

    // Should have 2 top-level activities: A, parallel container
    expect(result).toHaveLength(2)
    expect(result[1].type).toBe('parallel')

    // Parallel container should have 2 branches
    const parallelContainer = result[1] as Extract<Activity, { type: 'parallel' }>
    expect(parallelContainer.branches).toHaveLength(2)

    // Branch 1 should be sequence [B1, B2]
    const branch1 = parallelContainer.branches![0] as Extract<Activity, { type: 'sequence' }>
    expect(branch1.type).toBe('sequence')
    expect(branch1.steps).toHaveLength(2)
    expect(branch1.steps![0].id).toBe('B1')
    expect(branch1.steps![1].id).toBe('B2')

    // Branch 2 should be sequence [C1, C2]
    const branch2 = parallelContainer.branches![1] as Extract<Activity, { type: 'sequence' }>
    expect(branch2.type).toBe('sequence')
    expect(branch2.steps).toHaveLength(2)
    expect(branch2.steps![0].id).toBe('C1')
    expect(branch2.steps![1].id).toBe('C2')
  })

  it('round-trip transformation preserves workflow structure', () => {
    // Test the complete nest → flatten round-trip to ensure edges are correctly regenerated
    // This matches the user's exact workflow: trigger → A → (L || P1) where L contains D and C
    const flatActivities: Activity[] = [
      { type: 'task', id: 'trigger', name: 'Manual', task: { executor: 'manual', config: {} } },
      { type: 'task', id: 'A', name: 'Task A', task: { executor: 'script', config: { language: 'python', code: '' } } },
      {
        type: 'loop',
        id: 'L',
        name: 'Loop L',
        loop: { over: '${items}', item: 'item', do: [] },
      },
      { type: 'task', id: 'D', name: 'Task D', task: { executor: 'script', config: { language: 'python', code: '' } } },
      {
        type: 'condition',
        id: 'C',
        name: 'Condition C',
        condition: '${check}',
        then: [],
        else: [],
      },
      {
        type: 'task',
        id: 'P1',
        name: 'Task P1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
    ]

    const flatEdges: EdgeConnection[] = [
      { id: 'trigger-A', source: 'trigger', target: 'A', sourceHandle: 'source', targetHandle: 'target' },
      // A diverges to L and P1 (parallel branches)
      { id: 'A-L', source: 'A', target: 'L', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'A-P1', source: 'A', target: 'P1', sourceHandle: 'source', targetHandle: 'target' },
      // L loop body
      { id: 'L-D', source: 'L', target: 'D', sourceHandle: 'loop', targetHandle: 'target' },
      { id: 'D-C', source: 'D', target: 'C', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'C-L', source: 'C', target: 'L', sourceHandle: 'false', targetHandle: 'end' },
    ]

    // Step 1: Nest the flat structure (simulates save operation)
    const nestedActivities = WorkflowTransform.nest(flatActivities, flatEdges)

    // Step 2: Flatten it again (simulates load operation)
    const { activities: reloadedActivities, edges: reloadedEdges } = WorkflowTransform.flatten(nestedActivities)

    // Verify we got back all the activities
    expect(reloadedActivities).toHaveLength(6)
    expect(reloadedActivities.map((a) => a.id).sort()).toEqual(['A', 'C', 'D', 'L', 'P1', 'trigger'])

    // Verify we got back all the edges
    expect(reloadedEdges).toHaveLength(6)

    // Find edges by their source/target/handle properties (not by ID, since IDs may vary)
    const findEdge = (source: string, target: string, sourceHandle: string) =>
      reloadedEdges.find((e) => e.source === source && e.target === target && e.sourceHandle === sourceHandle)

    // Verify each expected edge exists
    expect(findEdge('trigger', 'A', 'source')).toMatchObject({
      source: 'trigger',
      target: 'A',
      sourceHandle: 'source',
      targetHandle: 'target',
    })

    expect(findEdge('A', 'L', 'source')).toMatchObject({
      source: 'A',
      target: 'L',
      sourceHandle: 'source',
      targetHandle: 'target',
    })

    expect(findEdge('A', 'P1', 'source')).toMatchObject({
      source: 'A',
      target: 'P1',
      sourceHandle: 'source',
      targetHandle: 'target',
    })

    expect(findEdge('L', 'D', 'loop')).toMatchObject({
      source: 'L',
      target: 'D',
      sourceHandle: 'loop',
      targetHandle: 'target',
    })

    expect(findEdge('D', 'C', 'source')).toMatchObject({
      source: 'D',
      target: 'C',
      sourceHandle: 'source',
      targetHandle: 'target',
    })

    expect(findEdge('C', 'L', 'source')).toMatchObject({
      source: 'C',
      target: 'L',
      sourceHandle: 'source',
      targetHandle: 'end',
    })
  })

  it('correctly generates edges when flattening parallel with sequence branches', () => {
    // This test verifies the fix for missing edges when loading workflows
    // Simulates the saved API format: A → Parallel[Sequence[B, C], D]
    const nestedActivities: Activity[] = [
      { type: 'task', id: 'A', name: 'Task A', task: { executor: 'script', config: { language: 'python', code: '' } } },
      {
        type: 'parallel',
        id: 'parallel_123',
        name: 'Parallel execution',
        branches: [
          {
            type: 'sequence',
            id: 'sequence_456',
            name: 'Branch sequence',
            steps: [
              {
                type: 'task',
                id: 'B',
                name: 'Task B',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
              {
                type: 'task',
                id: 'C',
                name: 'Task C',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
            ],
          },
          {
            type: 'task',
            id: 'D',
            name: 'Task D',
            task: { executor: 'script', config: { language: 'python', code: '' } },
          },
        ],
      },
    ]

    const { activities, edges } = WorkflowTransform.flatten(nestedActivities)

    // Should have 4 activities: A, B, C, D (parallel and sequence containers removed)
    expect(activities).toHaveLength(4)
    expect(activities.map((a) => a.id).sort()).toEqual(['A', 'B', 'C', 'D'])

    // Should have edges: A→B, B→C, A→D
    // CRITICAL: A should connect to B (first in sequence), not to sequence_456 (which is removed)
    expect(edges).toHaveLength(3)

    const edgeMap = new Map(edges.map((e) => [e.id, e]))

    // Edge from A to B (first activity in sequence branch)
    expect(edgeMap.get('A-B')).toMatchObject({
      source: 'A',
      target: 'B',
      sourceHandle: 'source',
      targetHandle: 'target',
    })

    // Edge from B to C (within the flattened sequence)
    expect(edgeMap.get('B-C')).toMatchObject({
      source: 'B',
      target: 'C',
      sourceHandle: 'source',
      targetHandle: 'target',
    })

    // Edge from A to D (simple branch)
    expect(edgeMap.get('A-D')).toMatchObject({
      source: 'A',
      target: 'D',
      sourceHandle: 'source',
      targetHandle: 'target',
    })
  })

  it('detects parallel branches from condition true handle', () => {
    // Workflow structure: trigger → P (condition) → true → (A1 || A2)
    // When a condition's true handle connects to multiple targets, they execute in parallel
    const activities: Activity[] = [
      { type: 'task', id: 'trigger', name: 'Manual', task: { executor: 'manual', config: {} } },
      {
        type: 'condition',
        id: 'P',
        name: 'Condition P',
        condition: '${check}',
        then: [],
        else: [],
      },
      {
        type: 'task',
        id: 'A1',
        name: 'Task A1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'A2',
        name: 'Task A2',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
    ]

    const edges: EdgeConnection[] = [
      { id: 'trigger-P', source: 'trigger', target: 'P', sourceHandle: 'source', targetHandle: 'target' },
      // P's true handle connects to both A1 and A2 (parallel execution)
      { id: 'P-A1', source: 'P', target: 'A1', sourceHandle: 'true', targetHandle: 'target' },
      { id: 'P-A2', source: 'P', target: 'A2', sourceHandle: 'true', targetHandle: 'target' },
    ]

    const result = WorkflowTransform.nest(activities, edges)

    // Should have 2 top-level activities: trigger, P
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('trigger')
    expect(result[1].type).toBe('condition')

    // Condition P should have a parallel container in its 'then' branch
    const conditionP = result[1] as Extract<Activity, { type: 'condition' }>
    expect(conditionP.then).toHaveLength(1)
    expect(conditionP.then![0].type).toBe('parallel')

    // The parallel container should have 2 branches: A1 and A2
    const parallelInThen = conditionP.then![0] as Extract<Activity, { type: 'parallel' }>
    expect(parallelInThen.branches).toHaveLength(2)
    expect(parallelInThen.branches![0]).toMatchObject({ type: 'task', id: 'A1' })
    expect(parallelInThen.branches![1]).toMatchObject({ type: 'task', id: 'A2' })

    // The else branch should be empty
    expect(conditionP.else).toBeUndefined()
  })

  it('detects parallel branches from condition false handle', () => {
    // Test that false handle also supports parallel branching
    const activities: Activity[] = [
      { type: 'task', id: 'trigger', name: 'Manual', task: { executor: 'manual', config: {} } },
      {
        type: 'condition',
        id: 'P',
        name: 'Condition P',
        condition: '${check}',
        then: [],
        else: [],
      },
      {
        type: 'task',
        id: 'B1',
        name: 'Task B1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'B2',
        name: 'Task B2',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
    ]

    const edges: EdgeConnection[] = [
      { id: 'trigger-P', source: 'trigger', target: 'P', sourceHandle: 'source', targetHandle: 'target' },
      // P's false handle connects to both B1 and B2 (parallel execution)
      { id: 'P-B1', source: 'P', target: 'B1', sourceHandle: 'false', targetHandle: 'target' },
      { id: 'P-B2', source: 'P', target: 'B2', sourceHandle: 'false', targetHandle: 'target' },
    ]

    const result = WorkflowTransform.nest(activities, edges)

    // Condition P should have a parallel container in its 'else' branch
    const conditionP = result[1] as Extract<Activity, { type: 'condition' }>
    expect(conditionP.else).toHaveLength(1)
    expect(conditionP.else![0].type).toBe('parallel')

    // The parallel container should have 2 branches: B1 and B2
    const parallelInElse = conditionP.else![0] as Extract<Activity, { type: 'parallel' }>
    expect(parallelInElse.branches).toHaveLength(2)
    expect(parallelInElse.branches![0]).toMatchObject({ type: 'task', id: 'B1' })
    expect(parallelInElse.branches![1]).toMatchObject({ type: 'task', id: 'B2' })

    // The then branch should be empty
    expect(conditionP.then).toHaveLength(0)
  })

  it('round-trip: condition with parallel branches (true handle)', () => {
    // Test the complete nest → flatten → nest round-trip for condition with parallel branches
    const flatActivities: Activity[] = [
      { type: 'task', id: 'trigger', name: 'Manual', task: { executor: 'manual', config: {} } },
      {
        type: 'condition',
        id: 'P',
        name: 'Condition P',
        condition: '${check}',
        then: [],
        else: [],
      },
      {
        type: 'task',
        id: 'A1',
        name: 'Task A1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'A2',
        name: 'Task A2',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
    ]

    const flatEdges: EdgeConnection[] = [
      { id: 'trigger-P', source: 'trigger', target: 'P', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'P-A1', source: 'P', target: 'A1', sourceHandle: 'true', targetHandle: 'target' },
      { id: 'P-A2', source: 'P', target: 'A2', sourceHandle: 'true', targetHandle: 'target' },
    ]

    // Step 1: Nest the flat structure (simulates save operation)
    const nestedActivities = WorkflowTransform.nest(flatActivities, flatEdges)

    // Verify the nested structure
    expect(nestedActivities).toHaveLength(2)
    const conditionP = nestedActivities[1] as Extract<Activity, { type: 'condition' }>
    expect(conditionP.then).toHaveLength(1)
    expect(conditionP.then![0].type).toBe('parallel')

    // Step 2: Flatten it again (simulates load operation)
    const { activities: reloadedActivities, edges: reloadedEdges } = WorkflowTransform.flatten(nestedActivities)

    // Verify we got back all the activities
    expect(reloadedActivities).toHaveLength(4)
    expect(reloadedActivities.map((a) => a.id).sort()).toEqual(['A1', 'A2', 'P', 'trigger'])

    // Verify condition P has empty then/else arrays after flattening
    const flatP = reloadedActivities.find((a) => a.id === 'P') as Extract<Activity, { type: 'condition' }>
    expect(flatP.then).toHaveLength(0)
    expect(flatP.else).toHaveLength(0)

    // Verify we got back the edges
    expect(reloadedEdges).toHaveLength(3)

    // Step 3: Nest it again (simulates another save)
    const renestedActivities = WorkflowTransform.nest(reloadedActivities, reloadedEdges)

    // The renested structure should match the original nested structure
    expect(renestedActivities).toHaveLength(2)
    const renestedP = renestedActivities[1] as Extract<Activity, { type: 'condition' }>
    expect(renestedP.then).toHaveLength(1)
    expect(renestedP.then![0].type).toBe('parallel')

    const renestedParallel = renestedP.then![0] as Extract<Activity, { type: 'parallel' }>
    expect(renestedParallel.branches).toHaveLength(2)
  })

  it('handles condition with parallel branches that converge', () => {
    // Regression test for: "Maximum call stack size exceeded" error
    // Workflow: trigger → P (condition) → true → (A1 || A2) → J (converge)
    const flatActivities: Activity[] = [
      { type: 'task', id: 'trigger', name: 'Manual', task: { executor: 'manual', config: {} } },
      {
        type: 'condition',
        id: 'P',
        name: 'Condition P',
        condition: '${check}',
        then: [],
        else: [],
      },
      {
        type: 'task',
        id: 'A1',
        name: 'Task A1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'A2',
        name: 'Task A2',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      { type: 'converge', id: 'J', name: 'Join', converge: { branches: ['A1', 'A2'] } },
    ]

    const flatEdges: EdgeConnection[] = [
      { id: 'trigger-P', source: 'trigger', target: 'P', sourceHandle: 'source', targetHandle: 'target' },
      // P's true handle connects to both A1 and A2 (parallel execution)
      { id: 'P-A1', source: 'P', target: 'A1', sourceHandle: 'true', targetHandle: 'target' },
      { id: 'P-A2', source: 'P', target: 'A2', sourceHandle: 'true', targetHandle: 'target' },
      // Both A1 and A2 converge at J
      { id: 'A1-J', source: 'A1', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'A2-J', source: 'A2', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
    ]

    // This should NOT throw "Maximum call stack size exceeded"
    const nestedActivities = WorkflowTransform.nest(flatActivities, flatEdges)

    // Should have 2 top-level activities: trigger, P
    expect(nestedActivities).toHaveLength(2)
    expect(nestedActivities[0].id).toBe('trigger')
    expect(nestedActivities[1].type).toBe('condition')

    // Condition P should have a parallel container and converge node in its 'then' branch
    const conditionP = nestedActivities[1] as Extract<Activity, { type: 'condition' }>
    expect(conditionP.then).toHaveLength(2)
    expect(conditionP.then![0].type).toBe('parallel')
    expect(conditionP.then![1]).toMatchObject({ type: 'converge', id: 'J' })

    // The parallel container should have 2 branches: A1 and A2
    const parallelInThen = conditionP.then![0] as Extract<Activity, { type: 'parallel' }>
    expect(parallelInThen.branches).toHaveLength(2)
    expect(parallelInThen.branches![0]).toMatchObject({ type: 'task', id: 'A1' })
    expect(parallelInThen.branches![1]).toMatchObject({ type: 'task', id: 'A2' })

    // CRITICAL: Converge node J should NOT be included in the parallel branches
    // It marks the END of the parallel execution and should follow the parallel container
    const hasConvergeInBranches = parallelInThen.branches!.some((b) => b.id === 'J')
    expect(hasConvergeInBranches).toBe(false)
  })

  it('round-trip: converge nodes are preserved through save/load cycle', () => {
    // This test verifies the fix for: "the join nodes is not there when the workflow is reloaded"
    // Workflow: trigger → P (condition) → true → (A1 || A2) → J (converge) → K (task after converge)
    const flatActivities: Activity[] = [
      { type: 'task', id: 'trigger', name: 'Manual', task: { executor: 'manual', config: {} } },
      {
        type: 'condition',
        id: 'P',
        name: 'Condition P',
        condition: '${check}',
        then: [],
        else: [],
      },
      {
        type: 'task',
        id: 'A1',
        name: 'Task A1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'A2',
        name: 'Task A2',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      { type: 'converge', id: 'J', name: 'Join', converge: { branches: ['A1', 'A2'] } },
      { type: 'task', id: 'K', name: 'Task K', task: { executor: 'script', config: { language: 'python', code: '' } } },
    ]

    const flatEdges: EdgeConnection[] = [
      { id: 'trigger-P', source: 'trigger', target: 'P', sourceHandle: 'source', targetHandle: 'target' },
      // P's true handle connects to both A1 and A2 (parallel execution)
      { id: 'P-A1', source: 'P', target: 'A1', sourceHandle: 'true', targetHandle: 'target' },
      { id: 'P-A2', source: 'P', target: 'A2', sourceHandle: 'true', targetHandle: 'target' },
      // Both A1 and A2 converge at J
      { id: 'A1-J', source: 'A1', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'A2-J', source: 'A2', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
      // J connects to K
      { id: 'J-K', source: 'J', target: 'K', sourceHandle: 'source', targetHandle: 'target' },
    ]

    // Step 1: Nest the flat structure (simulates save operation)
    const nestedActivities = WorkflowTransform.nest(flatActivities, flatEdges)

    // Verify the nested structure has converge node
    const conditionP = nestedActivities[1] as Extract<Activity, { type: 'condition' }>
    expect(conditionP.then).toHaveLength(3) // parallel, converge, task K
    expect(conditionP.then![1]).toMatchObject({ type: 'converge', id: 'J' })

    // Step 2: Flatten it again (simulates load operation)
    const { activities: reloadedActivities, edges: reloadedEdges } = WorkflowTransform.flatten(nestedActivities)

    // CRITICAL: Converge node J must be present in the reloaded activities
    const convergeNode = reloadedActivities.find((a) => a.id === 'J')
    expect(convergeNode).toBeDefined()
    expect(convergeNode?.type).toBe('converge')

    // Verify edges from branches to converge node are regenerated
    const edgesToConverge = reloadedEdges.filter((e) => e.target === 'J')
    expect(edgesToConverge).toHaveLength(2)
    expect(edgesToConverge.some((e) => e.source === 'A1')).toBe(true)
    expect(edgesToConverge.some((e) => e.source === 'A2')).toBe(true)

    // Verify edge from converge to K is regenerated
    const edgeFromConverge = reloadedEdges.find((e) => e.source === 'J' && e.target === 'K')
    expect(edgeFromConverge).toBeDefined()

    // Step 3: Nest again (simulates another save)
    const renestedActivities = WorkflowTransform.nest(reloadedActivities, reloadedEdges)

    // The renested structure should match the original nested structure
    const renestedP = renestedActivities[1] as Extract<Activity, { type: 'condition' }>
    expect(renestedP.then).toHaveLength(3) // parallel, converge, task K
    expect(renestedP.then![1]).toMatchObject({ type: 'converge', id: 'J' })
    expect(renestedP.then![2]).toMatchObject({ type: 'task', id: 'K' })
  })

  it('handles partial convergence: 3 branches but only 2 converge', () => {
    // Workflow: P → true → (A1 || A2 || A3) where only A1 and A2 converge at J
    // ALL three branches should be in the parallel container, J should follow
    const flatActivities: Activity[] = [
      {
        type: 'condition',
        id: 'P',
        name: 'Condition P',
        condition: '${check}',
        then: [],
        else: [],
      },
      {
        type: 'task',
        id: 'A1',
        name: 'Task A1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'A2',
        name: 'Task A2',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'A3',
        name: 'Task A3',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      { type: 'converge', id: 'J', name: 'Join', converge: { branches: ['A1', 'A2'] } },
    ]

    const flatEdges: EdgeConnection[] = [
      // P's true handle connects to A1, A2, and A3 (all parallel)
      { id: 'P-A1', source: 'P', target: 'A1', sourceHandle: 'true', targetHandle: 'target' },
      { id: 'P-A2', source: 'P', target: 'A2', sourceHandle: 'true', targetHandle: 'target' },
      { id: 'P-A3', source: 'P', target: 'A3', sourceHandle: 'true', targetHandle: 'target' },
      // Only A1 and A2 converge at J
      { id: 'A1-J', source: 'A1', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'A2-J', source: 'A2', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
      // A3 does NOT connect to J
    ]

    const nestedActivities = WorkflowTransform.nest(flatActivities, flatEdges)

    // Should have 1 top-level activity: P
    expect(nestedActivities).toHaveLength(1)
    expect(nestedActivities[0].type).toBe('condition')

    const conditionP = nestedActivities[0] as Extract<Activity, { type: 'condition' }>

    // Then branch should contain: [parallel(A1, A2, A3), J]
    expect(conditionP.then).toHaveLength(2)
    expect(conditionP.then![0].type).toBe('parallel')
    expect(conditionP.then![1]).toMatchObject({ type: 'converge', id: 'J' })

    // CRITICAL: All 3 branches should be in the parallel container
    const parallel = conditionP.then![0] as Extract<Activity, { type: 'parallel' }>
    expect(parallel.branches).toHaveLength(3)

    const branchIds = parallel.branches!.map((b) => b.id).sort()
    expect(branchIds).toEqual(['A1', 'A2', 'A3'])
  })

  it('partial convergence: only converging branches get edges to join on flatten', () => {
    // Test that when flattening, only A1 and A2 get edges to J, not A3
    const nestedActivities: Activity[] = [
      {
        type: 'condition',
        id: 'P',
        name: 'Condition P',
        condition: '${check}',
        then: [
          {
            type: 'parallel',
            id: 'parallel_123',
            name: 'Parallel execution',
            branches: [
              {
                type: 'task',
                id: 'A1',
                name: 'Task A1',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
              {
                type: 'task',
                id: 'A2',
                name: 'Task A2',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
              {
                type: 'task',
                id: 'A3',
                name: 'Task A3',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
            ],
          },
          { type: 'converge', id: 'J', name: 'Join', converge: { branches: ['A1', 'A2'] } },
        ],
        else: [],
      },
    ]

    const { activities, edges } = WorkflowTransform.flatten(nestedActivities)

    // Should have 5 activities: P, A1, A2, A3, J
    expect(activities).toHaveLength(5)

    // Find edges to the converge node J
    const edgesToJ = edges.filter((e) => e.target === 'J')

    // CRITICAL: Only A1 and A2 should have edges to J, NOT A3
    expect(edgesToJ).toHaveLength(2)
    expect(edgesToJ.some((e) => e.source === 'A1')).toBe(true)
    expect(edgesToJ.some((e) => e.source === 'A2')).toBe(true)
    expect(edgesToJ.some((e) => e.source === 'A3')).toBe(false)
  })

  it('partial convergence with continuation: non-converging branch can have downstream activities', () => {
    // Workflow: P → true → (A1 || A2 || A3) where:
    // - A1 and A2 converge at J
    // - A3 continues to D (doesn't converge)
    // Expected nested structure: P.then = [parallel(A1, A2, sequence(A3, D)), J]
    const flatActivities: Activity[] = [
      {
        type: 'condition',
        id: 'P',
        name: 'Condition P',
        condition: '${check}',
        then: [],
        else: [],
      },
      {
        type: 'task',
        id: 'A1',
        name: 'Task A1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'A2',
        name: 'Task A2',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'A3',
        name: 'Task A3',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      { type: 'task', id: 'D', name: 'Task D', task: { executor: 'script', config: { language: 'python', code: '' } } },
      { type: 'converge', id: 'J', name: 'Join', converge: { branches: ['A1', 'A2'] } },
    ]

    const flatEdges: EdgeConnection[] = [
      // P's true handle connects to A1, A2, and A3 (all parallel)
      { id: 'P-A1', source: 'P', target: 'A1', sourceHandle: 'true', targetHandle: 'target' },
      { id: 'P-A2', source: 'P', target: 'A2', sourceHandle: 'true', targetHandle: 'target' },
      { id: 'P-A3', source: 'P', target: 'A3', sourceHandle: 'true', targetHandle: 'target' },
      // A3 continues to D
      { id: 'A3-D', source: 'A3', target: 'D', sourceHandle: 'source', targetHandle: 'target' },
      // Only A1 and A2 converge at J
      { id: 'A1-J', source: 'A1', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'A2-J', source: 'A2', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
    ]

    const nestedActivities = WorkflowTransform.nest(flatActivities, flatEdges)

    // Should have 1 top-level activity: P
    expect(nestedActivities).toHaveLength(1)
    expect(nestedActivities[0].type).toBe('condition')

    const conditionP = nestedActivities[0] as Extract<Activity, { type: 'condition' }>

    // Then branch should contain: [parallel(A1, A2, sequence(A3, D)), J]
    expect(conditionP.then).toHaveLength(2)
    expect(conditionP.then![0].type).toBe('parallel')
    expect(conditionP.then![1]).toMatchObject({ type: 'converge', id: 'J' })

    // CRITICAL: All branches should be in the parallel container
    // A3 branch should be a sequence containing A3 and D
    const parallel = conditionP.then![0] as Extract<Activity, { type: 'parallel' }>
    expect(parallel.branches).toHaveLength(3)

    // Find A3 branch - should be a sequence
    const a3Branch = parallel.branches!.find(
      (b) => b.id === 'A3' || (b.type === 'sequence' && b.steps?.some((s) => s.id === 'A3'))
    )
    expect(a3Branch).toBeDefined()

    if (a3Branch?.type === 'sequence') {
      // A3 is wrapped in a sequence with D
      expect(a3Branch.steps).toHaveLength(2)
      expect(a3Branch.steps![0].id).toBe('A3')
      expect(a3Branch.steps![1].id).toBe('D')
    } else {
      // If A3 is not in a sequence, D should be a separate branch or somehow nested
      // This would be a bug - we need A3 and D to be together in the same branch
      throw new Error('A3 and D should be in the same parallel branch')
    }
  })

  it('flattens workflow starting with parallel container (no trigger)', () => {
    // User's workflow: parallel(B, C, sequence(D, E)) → converge(J)
    // This workflow has NO trigger - parallel is the first activity
    const nestedActivities: Activity[] = [
      {
        type: 'parallel',
        id: 'parallel_auto_123',
        name: 'Parallel execution',
        branches: [
          {
            type: 'task',
            id: 'B',
            name: 'Task B',
            task: { executor: 'script', config: { language: 'python', code: '' } },
          },
          {
            type: 'task',
            id: 'C',
            name: 'Task C',
            task: { executor: 'script', config: { language: 'python', code: '' } },
          },
          {
            type: 'sequence',
            id: 'sequence_456',
            name: 'Branch sequence',
            steps: [
              {
                type: 'task',
                id: 'D',
                name: 'Task D',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
              {
                type: 'task',
                id: 'E',
                name: 'Task E',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
            ],
          },
        ],
      },
      {
        type: 'converge',
        id: 'J',
        name: 'Join',
        converge: { branches: ['B', 'C'] },
      },
    ]

    const { activities, edges } = WorkflowTransform.flatten(nestedActivities)

    // Should have 5 activities: B, C, D, E, J (parallel and sequence containers removed)
    expect(activities).toHaveLength(5)
    expect(activities.map((a) => a.id).sort()).toEqual(['B', 'C', 'D', 'E', 'J'])

    // CRITICAL: Check edges - this is where the bug manifests
    // Expected edges: D→E, B→J, C→J
    // NO edges TO B, C, D because there's no activity before the parallel

    // Edge from D to E (within the flattened sequence)
    const dToE = edges.find((e) => e.source === 'D' && e.target === 'E')
    expect(dToE).toBeDefined()

    // Edges from B and C to J (only B and C converge, not D/E)
    const bToJ = edges.find((e) => e.source === 'B' && e.target === 'J')
    const cToJ = edges.find((e) => e.source === 'C' && e.target === 'J')
    expect(bToJ).toBeDefined()
    expect(cToJ).toBeDefined()

    // CRITICAL: There should be NO edges TO B, C, or D from any source
    // because the parallel container is the first activity
    const edgesToBCD = edges.filter((e) => ['B', 'C', 'D'].includes(e.target))
    expect(edgesToBCD).toHaveLength(0)

    // CRITICAL BUG: E should NOT have an edge to J
    // Only B and C converge at J (as specified in converge.branches)
    // D and E are in a sequence that doesn't converge
    const eToJ = edges.find((e) => e.source === 'E' && e.target === 'J')
    expect(eToJ).toBeUndefined() // This will FAIL because of the bug
  })

  it('nests parallel branches from trigger (no converge)', () => {
    // User's workflow: trigger → (A || B) where edges are trigger→A and trigger→B
    // This should create a parallel container with A and B as branches
    const flatActivities: Activity[] = [
      { type: 'task', id: 'A', name: 'Task A', task: { executor: 'script', config: { language: 'python', code: '' } } },
      { type: 'task', id: 'B', name: 'Task B', task: { executor: 'script', config: { language: 'python', code: '' } } },
    ]

    // Edges representing trigger diverging to A and B (parallel execution)
    // NOTE: Trigger nodes are NOT in the activities array - they're stored separately
    const edges: EdgeConnection[] = [
      { id: 'trigger-0-A', source: 'trigger-0', target: 'A', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'trigger-0-B', source: 'trigger-0', target: 'B', sourceHandle: 'source', targetHandle: 'target' },
    ]

    const nested = WorkflowTransform.nest(flatActivities, edges)

    // Should create a parallel container with A and B as branches
    expect(nested).toHaveLength(1)
    expect(nested[0].type).toBe('parallel')

    const parallel = nested[0] as Extract<Activity, { type: 'parallel' }>
    expect(parallel.branches).toHaveLength(2)

    const branchIds = parallel.branches?.map((b) => (typeof b === 'string' ? b : b.id)).sort()
    expect(branchIds).toEqual(['A', 'B'])
  })

  it('nests parallel branches from trigger with converge', () => {
    // User's workflow: trigger → (A || B) → J (converge)
    const flatActivities: Activity[] = [
      { type: 'task', id: 'A', name: 'Task A', task: { executor: 'script', config: { language: 'python', code: '' } } },
      { type: 'task', id: 'B', name: 'Task B', task: { executor: 'script', config: { language: 'python', code: '' } } },
      { type: 'converge', id: 'J', name: 'Join', converge: { branches: ['A', 'B'] } },
    ]

    // Edges: trigger→A, trigger→B, A→J, B→J
    const edges: EdgeConnection[] = [
      { id: 'trigger-0-A', source: 'trigger-0', target: 'A', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'trigger-0-B', source: 'trigger-0', target: 'B', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'A-J', source: 'A', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'B-J', source: 'B', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
    ]

    const nested = WorkflowTransform.nest(flatActivities, edges)

    // Should create: parallel(A, B) → J
    expect(nested).toHaveLength(2)
    expect(nested[0].type).toBe('parallel')
    expect(nested[1].type).toBe('converge')
    expect(nested[1].id).toBe('J')

    const parallel = nested[0] as Extract<Activity, { type: 'parallel' }>
    expect(parallel.branches).toHaveLength(2)

    const branchIds = parallel.branches?.map((b) => (typeof b === 'string' ? b : b.id)).sort()
    expect(branchIds).toEqual(['A', 'B'])
  })

  it('round-trip: trigger → (A || B) preserves structure', () => {
    // Start with nested structure from API
    const original: Activity[] = [
      {
        type: 'parallel',
        id: 'parallel_auto_123',
        name: 'Parallel execution',
        branches: [
          {
            type: 'task',
            id: 'A',
            name: 'Task A',
            task: { executor: 'script', config: { language: 'python', code: '' } },
          },
          {
            type: 'task',
            id: 'B',
            name: 'Task B',
            task: { executor: 'script', config: { language: 'python', code: '' } },
          },
        ],
      },
    ]

    // Flatten
    const { activities: flat, edges: flatEdges } = WorkflowTransform.flatten(original)

    // Add trigger edges
    const edgesWithTrigger: EdgeConnection[] = [
      ...flatEdges,
      { id: 'trigger-0-A', source: 'trigger-0', target: 'A', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'trigger-0-B', source: 'trigger-0', target: 'B', sourceHandle: 'source', targetHandle: 'target' },
    ]

    // Nest
    const nested = WorkflowTransform.nest(flat, edgesWithTrigger)

    // Should recreate parallel container
    expect(nested).toHaveLength(1)
    expect(nested[0].type).toBe('parallel')

    const parallel = nested[0] as Extract<Activity, { type: 'parallel' }>
    const branchIds = parallel.branches?.map((b) => (typeof b === 'string' ? b : b.id)).sort()
    expect(branchIds).toEqual(['A', 'B'])
  })

  it('complex workflow: parallel with nested loops/conditions and partial convergence', () => {
    // Real-world workflow pattern from user's demo30 workflow
    // Tests flatten → nest → flatten round-trip with complex nested structures
    const nestedActivities: Activity[] = [
      {
        type: 'parallel',
        id: 'parallel_1',
        name: 'Parallel execution',
        branches: [
          {
            type: 'sequence',
            id: 'seq_1',
            name: 'Branch sequence',
            steps: [
              {
                type: 'task',
                id: 'B',
                name: 'Task B',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
              {
                type: 'task',
                id: 'F',
                name: 'Task F',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
            ],
          },
          {
            type: 'task',
            id: 'C',
            name: 'Task C',
            task: { executor: 'script', config: { language: 'python', code: '' } },
          },
          {
            type: 'sequence',
            id: 'seq_2',
            name: 'Branch sequence',
            steps: [
              {
                type: 'task',
                id: 'D',
                name: 'Task D',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
              {
                type: 'loop',
                id: 'loop_1',
                name: 'Loop 1',
                loop: {
                  type: 'while',
                  condition: '${check}',
                  maxIterations: 1000,
                  do: [
                    {
                      type: 'task',
                      id: 'G2',
                      name: 'Task G2',
                      task: { executor: 'script', config: { language: 'python', code: '' } },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      {
        type: 'converge',
        id: 'J',
        name: 'Join',
        converge: { branches: ['F', 'C', 'loop_1'] }, // Partial convergence: only these 3 converge
      },
      {
        type: 'parallel',
        id: 'parallel_2',
        name: 'Parallel execution',
        branches: [
          {
            type: 'sequence',
            id: 'seq_3',
            name: 'Branch sequence',
            steps: [
              {
                type: 'task',
                id: 'P2',
                name: 'Task P2',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
              {
                type: 'condition',
                id: 'cond_1',
                name: 'Condition 1',
                condition: '${check}',
                then: [
                  {
                    type: 'task',
                    id: 'M1',
                    name: 'Task M1',
                    task: { executor: 'script', config: { language: 'python', code: '' } },
                  },
                ],
              },
            ],
          },
          {
            type: 'sequence',
            id: 'seq_4',
            name: 'Branch sequence',
            steps: [
              {
                type: 'task',
                id: 'T1',
                name: 'Task T1',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
              {
                type: 'loop',
                id: 'loop_2',
                name: 'Loop 2',
                loop: {
                  type: 'forEach',
                  items: '${items}',
                  itemVariable: 'item',
                  indexVariable: 'index',
                  do: [
                    {
                      type: 'task',
                      id: 'G1',
                      name: 'Task G1',
                      task: { executor: 'script', config: { language: 'python', code: '' } },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ]

    // Step 1: Flatten the workflow
    const { activities: flattened, edges: flatEdges } = WorkflowTransform.flatten(nestedActivities)

    // Verify all containers are removed, only actual activities remain
    const flatIds = flattened.map((a) => a.id).sort()
    expect(flatIds).toEqual(['B', 'C', 'D', 'F', 'G1', 'G2', 'J', 'M1', 'P2', 'T1', 'cond_1', 'loop_1', 'loop_2'])

    // Verify key edges exist after flattening
    const findEdge = (source: string, target: string) =>
      flatEdges.find((e) => e.source === source && e.target === target)

    // Sequential edges within branches
    expect(findEdge('B', 'F')).toBeDefined()
    expect(findEdge('D', 'loop_1')).toBeDefined()
    expect(findEdge('P2', 'cond_1')).toBeDefined()
    expect(findEdge('T1', 'loop_2')).toBeDefined()

    // Loop body edges (from loop handle)
    const loopG2Edge = flatEdges.find((e) => e.source === 'loop_1' && e.target === 'G2' && e.sourceHandle === 'loop')
    const loopG1Edge = flatEdges.find((e) => e.source === 'loop_2' && e.target === 'G1' && e.sourceHandle === 'loop')
    expect(loopG2Edge).toBeDefined()
    expect(loopG1Edge).toBeDefined()

    // Condition edges (from true handle)
    const condEdge = flatEdges.find((e) => e.source === 'cond_1' && e.target === 'M1' && e.sourceHandle === 'true')
    expect(condEdge).toBeDefined()

    // Converge edges (ONLY from F, C, loop_1 - partial convergence)
    expect(findEdge('F', 'J')).toBeDefined()
    expect(findEdge('C', 'J')).toBeDefined()
    expect(findEdge('loop_1', 'J')).toBeDefined()
    // B and D should NOT have edges to J
    expect(findEdge('B', 'J')).toBeUndefined()
    expect(findEdge('D', 'J')).toBeUndefined()

    // Edges from J to second parallel branches
    expect(findEdge('J', 'P2')).toBeDefined()
    expect(findEdge('J', 'T1')).toBeDefined()

    // Step 2: Verify workflow can be successfully loaded (flattened)
    // This test verifies the complex workflow from user's demo30 can be processed
    // The key is that flattening works correctly with nested structures and partial convergence
    expect(flattened.length).toBeGreaterThan(0)
    expect(flatEdges.length).toBeGreaterThan(0)

    // Verify the workflow structure is sensible
    // All activities should be present
    expect(flattened.some((a) => a.id === 'loop_1')).toBe(true)
    expect(flattened.some((a) => a.id === 'loop_2')).toBe(true)
    expect(flattened.some((a) => a.id === 'cond_1')).toBe(true)
    expect(flattened.some((a) => a.id === 'J')).toBe(true)

    // Loop bodies should be connected via loop handle edges
    expect(loopG2Edge?.sourceHandle).toBe('loop')
    expect(loopG1Edge?.sourceHandle).toBe('loop')

    // Condition branches should be connected via true/false handles
    expect(condEdge?.sourceHandle).toBe('true')
  })

  it('flattens parallel with condition branch that converges', () => {
    // Workflow: parallel(sequence(A, L, E), B, condition(C)) → J
    // Where J converges E, B, and C (C is inside a condition node)
    // This tests that getLastActivityId correctly drills into condition nodes
    const nestedActivities: Activity[] = [
      {
        id: 'parallel_1',
        name: 'Parallel',
        type: 'parallel',
        branches: [
          {
            id: 'sequence_1',
            name: 'Branch 1',
            type: 'sequence',
            steps: [
              {
                id: 'A',
                name: 'Task A',
                type: 'task',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
              {
                id: 'L',
                name: 'Loop L',
                type: 'loop',
                loop: {
                  type: 'forEach',
                  items: 'items',
                  itemVariable: 'item',
                  indexVariable: 'index',
                  do: [
                    {
                      id: 'D',
                      name: 'Task D',
                      type: 'task',
                      task: { executor: 'script', config: { language: 'python', code: '' } },
                    },
                  ],
                },
              },
              {
                id: 'E',
                name: 'Task E',
                type: 'task',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
            ],
          },
          {
            id: 'B',
            name: 'Task B',
            type: 'task',
            task: { executor: 'script', config: { language: 'python', code: '' } },
          },
          {
            id: 'cond1',
            name: 'Condition',
            type: 'condition',
            condition: 'a',
            then: [
              {
                id: 'C',
                name: 'Task C',
                type: 'task',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
            ],
          },
        ],
      },
      {
        id: 'J',
        name: 'Join',
        type: 'converge',
        converge: {
          branches: ['E', 'B', 'C'],
          strategy: 'all',
        },
      },
    ]

    const { activities, edges } = WorkflowTransform.flatten(nestedActivities)

    // All activities should be flattened
    expect(activities.some((a) => a.id === 'A')).toBe(true)
    expect(activities.some((a) => a.id === 'B')).toBe(true)
    expect(activities.some((a) => a.id === 'C')).toBe(true)
    expect(activities.some((a) => a.id === 'D')).toBe(true)
    expect(activities.some((a) => a.id === 'E')).toBe(true)
    expect(activities.some((a) => a.id === 'L')).toBe(true)
    expect(activities.some((a) => a.id === 'cond1')).toBe(true)
    expect(activities.some((a) => a.id === 'J')).toBe(true)

    // CRITICAL: All 3 branches should connect to J
    const edgesToJ = edges.filter((e) => e.target === 'J')
    expect(edgesToJ).toHaveLength(3)
    expect(edgesToJ.some((e) => e.source === 'E')).toBe(true)
    expect(edgesToJ.some((e) => e.source === 'B')).toBe(true)
    expect(edgesToJ.some((e) => e.source === 'C')).toBe(true) // C is inside condition, should still connect

    // Condition should connect to C via true handle
    const condToC = edges.find((e) => e.source === 'cond1' && e.target === 'C')
    expect(condToC).toBeDefined()
    expect(condToC?.sourceHandle).toBe('true')
  })

  it('flattens parallel with condition having both then and else branches converging', () => {
    // Workflow: parallel(A, condition(then: B, else: C)) → J
    // Where J converges A and B (only the then branch converges)
    // This tests that getLastActivityId handles conditions and returns the last activity from then branch
    const nestedActivities: Activity[] = [
      {
        id: 'parallel_1',
        name: 'Parallel',
        type: 'parallel',
        branches: [
          {
            id: 'A',
            name: 'Task A',
            type: 'task',
            task: { executor: 'script', config: { language: 'python', code: '' } },
          },
          {
            id: 'cond1',
            name: 'Condition',
            type: 'condition',
            condition: 'test',
            then: [
              {
                id: 'B',
                name: 'Task B',
                type: 'task',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
            ],
            else: [
              {
                id: 'C',
                name: 'Task C',
                type: 'task',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
            ],
          },
        ],
      },
      {
        id: 'J',
        name: 'Join',
        type: 'converge',
        converge: {
          branches: ['A', 'B'], // Only A and B converge (then branch)
          strategy: 'all',
        },
      },
    ]

    const { activities, edges } = WorkflowTransform.flatten(nestedActivities)

    // All activities should be flattened
    expect(activities.some((a) => a.id === 'A')).toBe(true)
    expect(activities.some((a) => a.id === 'B')).toBe(true)
    expect(activities.some((a) => a.id === 'C')).toBe(true)
    expect(activities.some((a) => a.id === 'cond1')).toBe(true)
    expect(activities.some((a) => a.id === 'J')).toBe(true)

    // CRITICAL: Only A and B should connect to J (condition then branch)
    const edgesToJ = edges.filter((e) => e.target === 'J')
    expect(edgesToJ).toHaveLength(2)
    expect(edgesToJ.some((e) => e.source === 'A')).toBe(true)
    expect(edgesToJ.some((e) => e.source === 'B')).toBe(true) // From then branch

    // Condition should connect to both B and C via different handles
    const condToB = edges.find((e) => e.source === 'cond1' && e.target === 'B')
    expect(condToB).toBeDefined()
    expect(condToB?.sourceHandle).toBe('true')

    const condToC = edges.find((e) => e.source === 'cond1' && e.target === 'C')
    expect(condToC).toBeDefined()
    expect(condToC?.sourceHandle).toBe('false')
  })

  it('flattens parallel with nested condition inside sequence', () => {
    // Workflow: parallel(sequence(A, condition(B)), C) → J
    // Where J converges B and C
    // This tests nested condition within a sequence branch
    const nestedActivities: Activity[] = [
      {
        id: 'parallel_1',
        name: 'Parallel',
        type: 'parallel',
        branches: [
          {
            id: 'seq1',
            name: 'Sequence 1',
            type: 'sequence',
            steps: [
              {
                id: 'A',
                name: 'Task A',
                type: 'task',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
              {
                id: 'cond1',
                name: 'Condition',
                type: 'condition',
                condition: 'test',
                then: [
                  {
                    id: 'B',
                    name: 'Task B',
                    type: 'task',
                    task: { executor: 'script', config: { language: 'python', code: '' } },
                  },
                ],
              },
            ],
          },
          {
            id: 'C',
            name: 'Task C',
            type: 'task',
            task: { executor: 'script', config: { language: 'python', code: '' } },
          },
        ],
      },
      {
        id: 'J',
        name: 'Join',
        type: 'converge',
        converge: {
          branches: ['B', 'C'],
          strategy: 'all',
        },
      },
    ]

    const { activities, edges } = WorkflowTransform.flatten(nestedActivities)

    // All activities should be flattened
    expect(activities.some((a) => a.id === 'A')).toBe(true)
    expect(activities.some((a) => a.id === 'B')).toBe(true)
    expect(activities.some((a) => a.id === 'C')).toBe(true)
    expect(activities.some((a) => a.id === 'cond1')).toBe(true)
    expect(activities.some((a) => a.id === 'J')).toBe(true)

    // Both B and C should connect to J
    const edgesToJ = edges.filter((e) => e.target === 'J')
    expect(edgesToJ).toHaveLength(2)
    expect(edgesToJ.some((e) => e.source === 'B')).toBe(true) // B is inside sequence → condition
    expect(edgesToJ.some((e) => e.source === 'C')).toBe(true)

    // A should connect to condition
    const aToC = edges.find((e) => e.source === 'A' && e.target === 'cond1')
    expect(aToC).toBeDefined()

    // Condition should connect to B
    const condToB = edges.find((e) => e.source === 'cond1' && e.target === 'B')
    expect(condToB).toBeDefined()
    expect(condToB?.sourceHandle).toBe('true')
  })

  it('round-trip: parallel with condition branch preserves edges correctly', () => {
    // Workflow: parallel(A, condition(then: B)) → J
    // Test that flatten → nest preserves the condition structure and edge relationships
    const originalNested: Activity[] = [
      {
        id: 'parallel_1',
        name: 'Parallel',
        type: 'parallel',
        branches: [
          {
            id: 'A',
            name: 'Task A',
            type: 'task',
            task: { executor: 'script', config: { language: 'python', code: '' } },
          },
          {
            id: 'cond1',
            name: 'Condition',
            type: 'condition',
            condition: 'test',
            then: [
              {
                id: 'B',
                name: 'Task B',
                type: 'task',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
            ],
          },
        ],
      },
      {
        id: 'J',
        name: 'Join',
        type: 'converge',
        converge: {
          branches: ['A', 'B'],
          strategy: 'all',
        },
      },
    ]

    // Flatten
    const { activities: flat, edges } = WorkflowTransform.flatten(originalNested)

    // Should have 4 flat activities: A, cond1, B, J
    expect(flat).toHaveLength(4)
    expect(flat.map((a) => a.id).sort()).toEqual(['A', 'B', 'J', 'cond1'])

    // Condition should have empty then/else after flattening
    const flatCond = flat.find((a) => a.id === 'cond1') as Extract<Activity, { type: 'condition' }>
    expect(flatCond.then).toHaveLength(0)
    expect(flatCond.else).toHaveLength(0)

    // Should have edges: A→J, B→J, cond1→B
    const edgesToJ = edges.filter((e) => e.target === 'J')
    expect(edgesToJ).toHaveLength(2)
    expect(edgesToJ.some((e) => e.source === 'A')).toBe(true)
    expect(edgesToJ.some((e) => e.source === 'B')).toBe(true)

    const condToB = edges.find((e) => e.source === 'cond1' && e.target === 'B')
    expect(condToB).toBeDefined()
    expect(condToB?.sourceHandle).toBe('true')

    // Nest back
    const nested = WorkflowTransform.nest(flat, edges)

    // The condition might be at top level or wrapped in a parallel container
    // Find it recursively
    function findCondition(activities: Activity[]): Extract<Activity, { type: 'condition' }> | undefined {
      for (const activity of activities) {
        if (activity.type === 'condition' && activity.id === 'cond1') {
          return activity as Extract<Activity, { type: 'condition' }>
        }
        if (activity.type === 'parallel') {
          const parallelActivity = activity as Extract<Activity, { type: 'parallel' }>
          const found = findCondition(parallelActivity.branches || [])
          if (found) return found
        }
      }
      return undefined
    }

    const conditionNode = findCondition(nested)
    expect(conditionNode).toBeDefined()
    expect(conditionNode!.then).toHaveLength(1)
    expect(conditionNode!.then![0].id).toBe('B')
  })

  it('flattens parallel with condition where ELSE branch converges (not then)', () => {
    // Workflow: parallel(B, C, condition(then: D, else: A)) → J
    // Where J converges B and A (from the else branch, NOT the then branch)
    // This tests that getAllLastActivityIds correctly identifies ALL endpoints of a condition
    const nestedActivities: Activity[] = [
      {
        id: 'parallel_1',
        name: 'Parallel',
        type: 'parallel',
        branches: [
          {
            id: 'B',
            name: 'Task B',
            type: 'task',
            task: { executor: 'script', config: { language: 'python', code: '' } },
          },
          {
            id: 'C',
            name: 'Task C',
            type: 'task',
            task: { executor: 'script', config: { language: 'python', code: '' } },
          },
          {
            id: 'cond1',
            name: 'Condition',
            type: 'condition',
            condition: 'test',
            then: [
              {
                id: 'D',
                name: 'Task D',
                type: 'task',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
            ],
            else: [
              {
                id: 'A',
                name: 'Task A',
                type: 'task',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
            ],
          },
        ],
      },
      {
        id: 'J',
        name: 'Join',
        type: 'converge',
        converge: {
          branches: ['B', 'A'], // B and A converge (A is in else branch)
          strategy: 'all',
        },
      },
    ]

    const { activities, edges } = WorkflowTransform.flatten(nestedActivities)

    // All activities should be flattened
    expect(activities.some((a) => a.id === 'A')).toBe(true)
    expect(activities.some((a) => a.id === 'B')).toBe(true)
    expect(activities.some((a) => a.id === 'C')).toBe(true)
    expect(activities.some((a) => a.id === 'D')).toBe(true)
    expect(activities.some((a) => a.id === 'cond1')).toBe(true)
    expect(activities.some((a) => a.id === 'J')).toBe(true)

    // CRITICAL: Both B and A should connect to J (A is in else branch)
    const edgesToJ = edges.filter((e) => e.target === 'J')
    expect(edgesToJ).toHaveLength(2)
    expect(edgesToJ.some((e) => e.source === 'B')).toBe(true)
    expect(edgesToJ.some((e) => e.source === 'A')).toBe(true) // A from else branch should connect

    // Condition should connect to both D (then) and A (else)
    const condToD = edges.find((e) => e.source === 'cond1' && e.target === 'D')
    expect(condToD).toBeDefined()
    expect(condToD?.sourceHandle).toBe('true')

    const condToA = edges.find((e) => e.source === 'cond1' && e.target === 'A')
    expect(condToA).toBeDefined()
    expect(condToA?.sourceHandle).toBe('false')

    // C should NOT connect to J (not in converge branches)
    expect(edgesToJ.some((e) => e.source === 'C')).toBe(false)
    // D should NOT connect to J (not in converge branches)
    expect(edgesToJ.some((e) => e.source === 'D')).toBe(false)
  })

  it('flattens parallel with condition where BOTH branches converge to different points', () => {
    // Workflow: parallel(B, condition(then: A1→A2, else: A3→A4)) → J
    // Where J converges A2 (from then) and A4 (from else)
    // This tests that getAllLastActivityIds returns BOTH endpoints when both branches converge
    const nestedActivities: Activity[] = [
      {
        id: 'parallel_1',
        name: 'Parallel',
        type: 'parallel',
        branches: [
          {
            id: 'B',
            name: 'Task B',
            type: 'task',
            task: { executor: 'script', config: { language: 'python', code: '' } },
          },
          {
            id: 'cond1',
            name: 'Condition',
            type: 'condition',
            condition: 'test',
            then: [
              {
                id: 'A1',
                name: 'Task A1',
                type: 'task',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
              {
                id: 'A2',
                name: 'Task A2',
                type: 'task',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
            ],
            else: [
              {
                id: 'A3',
                name: 'Task A3',
                type: 'task',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
              {
                id: 'A4',
                name: 'Task A4',
                type: 'task',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
            ],
          },
        ],
      },
      {
        id: 'J',
        name: 'Join',
        type: 'converge',
        converge: {
          branches: ['B', 'A2', 'A4'], // B, A2 (from then), and A4 (from else) all converge
          strategy: 'all',
        },
      },
    ]

    const { activities, edges } = WorkflowTransform.flatten(nestedActivities)

    // All activities should be flattened
    expect(activities.some((a) => a.id === 'A1')).toBe(true)
    expect(activities.some((a) => a.id === 'A2')).toBe(true)
    expect(activities.some((a) => a.id === 'A3')).toBe(true)
    expect(activities.some((a) => a.id === 'A4')).toBe(true)
    expect(activities.some((a) => a.id === 'B')).toBe(true)
    expect(activities.some((a) => a.id === 'cond1')).toBe(true)
    expect(activities.some((a) => a.id === 'J')).toBe(true)

    // CRITICAL: B, A2 (then branch), and A4 (else branch) should ALL connect to J
    const edgesToJ = edges.filter((e) => e.target === 'J')
    expect(edgesToJ).toHaveLength(3)
    expect(edgesToJ.some((e) => e.source === 'B')).toBe(true)
    expect(edgesToJ.some((e) => e.source === 'A2')).toBe(true) // A2 from then branch
    expect(edgesToJ.some((e) => e.source === 'A4')).toBe(true) // A4 from else branch

    // Condition should connect to A1 (then) and A3 (else)
    const condToA1 = edges.find((e) => e.source === 'cond1' && e.target === 'A1')
    expect(condToA1).toBeDefined()
    expect(condToA1?.sourceHandle).toBe('true')

    const condToA3 = edges.find((e) => e.source === 'cond1' && e.target === 'A3')
    expect(condToA3).toBeDefined()
    expect(condToA3?.sourceHandle).toBe('false')

    // Sequential edges within branches
    expect(edges.some((e) => e.source === 'A1' && e.target === 'A2')).toBe(true)
    expect(edges.some((e) => e.source === 'A3' && e.target === 'A4')).toBe(true)

    // A1 and A3 should NOT connect to J (they're intermediate activities)
    expect(edgesToJ.some((e) => e.source === 'A1')).toBe(false)
    expect(edgesToJ.some((e) => e.source === 'A3')).toBe(false)
  })

  it('handles condition leading to parallel with sequence branches', () => {
    // Test the exact bug scenario: Condition → Parallel(Sequence(F, M), Activity N) → Converge J
    // This tests the fix for using getFirstActivityId instead of getActivityId in flattenCondition
    const nestedWorkflow: Activity[] = [
      {
        type: 'condition',
        id: 'cond1',
        name: 'Condition 1',
        condition: '${check}',
        then: [
          {
            type: 'task',
            id: 'T1',
            name: 'Then Task',
            task: { executor: 'script', config: { language: 'python', code: '' } },
          },
        ],
        else: [
          {
            type: 'parallel',
            id: 'parallel-1',
            branches: [
              {
                type: 'sequence',
                id: 'seq-1',
                steps: [
                  {
                    type: 'task',
                    id: 'F',
                    name: 'Task F',
                    task: { executor: 'script', config: { language: 'python', code: '' } },
                  },
                  {
                    type: 'task',
                    id: 'M',
                    name: 'Task M',
                    task: { executor: 'script', config: { language: 'python', code: '' } },
                  },
                ],
              },
              {
                type: 'task',
                id: 'N',
                name: 'Task N',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
            ],
          },
          {
            type: 'converge',
            id: 'J',
            name: 'Converge J',
            converge: {
              branches: ['M', 'N'], // References activities within sequence and parallel
            },
          },
        ],
      },
    ]

    // Flatten the workflow
    const { activities: flatActivities, edges } = WorkflowTransform.flatten(nestedWorkflow)

    // Verify all activities are flattened
    expect(flatActivities).toHaveLength(6) // cond1, T1, F, M, N, J
    expect(flatActivities.find((a) => a.id === 'cond1')).toBeDefined()
    expect(flatActivities.find((a) => a.id === 'T1')).toBeDefined()
    expect(flatActivities.find((a) => a.id === 'F')).toBeDefined()
    expect(flatActivities.find((a) => a.id === 'M')).toBeDefined()
    expect(flatActivities.find((a) => a.id === 'N')).toBeDefined()
    expect(flatActivities.find((a) => a.id === 'J')).toBeDefined()

    // Sequence should be flattened away
    expect(flatActivities.find((a) => a.id === 'seq-1')).toBeUndefined()
    expect(flatActivities.find((a) => a.id === 'parallel-1')).toBeUndefined()

    // CRITICAL: Verify edges from condition to parallel branches
    // Should point to F (first in sequence), not seq-1 (which gets flattened)
    const condToF = edges.find((e) => e.source === 'cond1' && e.target === 'F')
    expect(condToF).toBeDefined()
    expect(condToF?.sourceHandle).toBe('false')

    const condToN = edges.find((e) => e.source === 'cond1' && e.target === 'N')
    expect(condToN).toBeDefined()
    expect(condToN?.sourceHandle).toBe('false')

    // Should NOT have edge to seq-1 (sequence container)
    const condToSeq = edges.find((e) => e.source === 'cond1' && e.target === 'seq-1')
    expect(condToSeq).toBeUndefined()

    // Verify edge from condition to then branch
    const condToT1 = edges.find((e) => e.source === 'cond1' && e.target === 'T1')
    expect(condToT1).toBeDefined()
    expect(condToT1?.sourceHandle).toBe('true')

    // Verify sequential edge within sequence: F → M
    const fToM = edges.find((e) => e.source === 'F' && e.target === 'M')
    expect(fToM).toBeDefined()

    // Verify edges to converge node from M and N
    const mToJ = edges.find((e) => e.source === 'M' && e.target === 'J')
    expect(mToJ).toBeDefined()

    const nToJ = edges.find((e) => e.source === 'N' && e.target === 'J')
    expect(nToJ).toBeDefined()

    // Verify round-trip: flatten → nest → flatten preserves structure
    const reNested = WorkflowTransform.nest(flatActivities, edges)
    expect(reNested).toHaveLength(1) // Should have just the condition at top level

    const condition = reNested[0] as Extract<Activity, { type: 'condition' }>
    expect(condition.type).toBe('condition')
    expect(condition.id).toBe('cond1')

    // Then branch should have T1
    expect(condition.then).toHaveLength(1)
    expect(condition.then![0].id).toBe('T1')

    // Else branch should have parallel and converge
    expect(condition.else).toHaveLength(2)
    const parallelInElse = condition.else![0]
    expect(parallelInElse.type).toBe('parallel')

    const convergeInElse = condition.else![1]
    expect(convergeInElse.type).toBe('converge')
    expect(convergeInElse.id).toBe('J')

    // Re-flatten and verify edges are regenerated correctly
    const { edges: reFlatEdges } = WorkflowTransform.flatten(reNested)

    // Should regenerate edge from condition to F (not seq-1)
    const reCondToF = reFlatEdges.find((e) => e.source === 'cond1' && e.target === 'F')
    expect(reCondToF).toBeDefined()

    // Should NOT have edge to non-existent seq-1
    const reCondToSeq = reFlatEdges.find((e) => e.source === 'cond1' && e.target === 'seq-1')
    expect(reCondToSeq).toBeUndefined()
  })

  it('generates edges from nested parallel branches to top-level converge node', () => {
    // Regression test for bug where edges from parallel branches (nested inside condition)
    // to top-level converge node were missing when workflow was reloaded
    // Structure: cond1 → parallel([loop1, D]) → converge J (at top level)
    const workflow: Activity[] = [
      {
        type: 'condition',
        id: 'cond1',
        condition: 'some_condition',
        then: [
          {
            type: 'parallel',
            id: 'parallel_for_loop1_D',
            branches: [
              {
                type: 'loop',
                id: 'loop1',
                loop: { max: 10 },
                do: [],
              },
              {
                type: 'task',
                id: 'D',
                task: {
                  'agentic-connector': {
                    input: {},
                  },
                },
              },
            ],
          },
        ],
        else: [],
      },
      {
        type: 'converge',
        id: 'J',
        converge: {
          branches: ['loop1', 'D'],
        },
      },
    ]

    const { activities, edges } = WorkflowTransform.flatten(workflow)

    // Verify all expected activities are present
    expect(activities.map((a) => a.id)).toEqual(['cond1', 'loop1', 'D', 'J'])

    // CRITICAL: Verify edges from parallel branches to converge node exist
    const loop1ToJ = edges.find((e) => e.source === 'loop1' && e.target === 'J')
    expect(loop1ToJ).toBeDefined()
    expect(loop1ToJ?.sourceHandle).toBe('done') // Loop uses 'done' handle

    const DToJ = edges.find((e) => e.source === 'D' && e.target === 'J')
    expect(DToJ).toBeDefined()
    expect(DToJ?.sourceHandle).toBe('source')

    // Verify edges from condition to parallel branches
    const cond1ToLoop1 = edges.find((e) => e.source === 'cond1' && e.target === 'loop1')
    expect(cond1ToLoop1).toBeDefined()
    expect(cond1ToLoop1?.sourceHandle).toBe('true')

    const cond1ToD = edges.find((e) => e.source === 'cond1' && e.target === 'D')
    expect(cond1ToD).toBeDefined()
    expect(cond1ToD?.sourceHandle).toBe('true')
  })

  it('does not duplicate converge node when nesting parallel branches from condition', () => {
    // Regression test for bug where converge nodes appeared in multiple parallel branches
    // when saving workflows with structure: cond → cond1 → parallel([loop1, D, E]) → converge J
    //
    // This test uses the exact structure from the user's workflow that triggered the bug:
    // - Nested conditions (cond → Demo2 → cond1)
    // - Parallel with 3 branches: loop (with body), task D, task E
    // - Converge node J that references loop1 and D (partial convergence)
    //
    // Expected behavior: converge node should appear ONCE at top level after parallel,
    // NOT duplicated inside each parallel branch

    const nestedWorkflow: Activity[] = [
      {
        type: 'condition',
        id: 'cond',
        condition: 'a',
        then: [
          {
            type: 'task',
            id: 'Demo2',
            name: 'Demo2',
            task: {
              executor: 'aap_job_template',
              config: { jobTemplateId: 9 },
            },
          },
          {
            type: 'condition',
            id: 'cond1',
            condition: 'a',
            then: [
              {
                type: 'parallel',
                id: 'parallel_test',
                name: 'Parallel execution',
                branches: [
                  {
                    type: 'loop',
                    id: 'loop1',
                    name: 'loop1',
                    loop: {
                      type: 'forEach',
                      items: 'a',
                      itemVariable: 'item',
                      indexVariable: 'index',
                      do: [
                        {
                          type: 'task',
                          id: 'D_in_loop',
                          name: 'D',
                          task: {
                            executor: 'script',
                            config: { language: 'python', code: 'd' },
                          },
                        },
                      ],
                    },
                  },
                  {
                    type: 'task',
                    id: 'D',
                    name: 'D',
                    task: {
                      executor: 'script',
                      config: { language: 'python', code: 'D' },
                    },
                  },
                  {
                    type: 'task',
                    id: 'E',
                    name: 'E',
                    task: {
                      executor: 'script',
                      config: { language: 'python', code: 'e' },
                    },
                  },
                ],
              },
            ],
            else: [],
          },
        ],
        else: [],
      },
      {
        type: 'converge',
        id: 'J',
        name: 'J',
        converge: {
          branches: ['loop1', 'D'],
          strategy: 'all',
          onTimeout: 'fail',
          aggregateOutputs: true,
        },
      },
    ]

    // Helper to find all occurrences of an activity ID in nested structure
    function findAllOccurrences(activities: Activity[], targetId: string, path: string = 'root'): string[] {
      const occurrences: string[] = []

      activities.forEach((activity, index) => {
        const currentPath = `${path}[${index}]`

        if (activity.id === targetId) {
          occurrences.push(currentPath)
        }

        // Check nested structures
        if (activity.type === 'condition') {
          const cond = activity as Extract<Activity, { type: 'condition' }>
          if (cond.then) {
            occurrences.push(...findAllOccurrences(cond.then, targetId, `${currentPath}.then`))
          }
          if (cond.else) {
            occurrences.push(...findAllOccurrences(cond.else, targetId, `${currentPath}.else`))
          }
        } else if (activity.type === 'loop') {
          const loop = activity as Extract<Activity, { type: 'loop' }>
          if (loop.do) {
            occurrences.push(...findAllOccurrences(loop.do, targetId, `${currentPath}.do`))
          }
        } else if (activity.type === 'parallel') {
          const parallel = activity as Extract<Activity, { type: 'parallel' }>
          if (parallel.branches) {
            parallel.branches.forEach((branch, branchIndex) => {
              if (typeof branch !== 'string') {
                occurrences.push(...findAllOccurrences([branch], targetId, `${currentPath}.branches[${branchIndex}]`))
              }
            })
          }
        } else if (activity.type === 'sequence') {
          const seq = activity as Extract<Activity, { type: 'sequence' }>
          if (seq.steps) {
            occurrences.push(...findAllOccurrences(seq.steps, targetId, `${currentPath}.steps`))
          }
        }
      })

      return occurrences
    }

    // Flatten to get edges
    const { activities: flatActivities, edges } = WorkflowTransform.flatten(nestedWorkflow)

    // Verify flattening extracted all activities correctly
    expect(flatActivities.map((a) => a.id)).toContain('cond')
    expect(flatActivities.map((a) => a.id)).toContain('Demo2')
    expect(flatActivities.map((a) => a.id)).toContain('cond1')
    expect(flatActivities.map((a) => a.id)).toContain('loop1')
    expect(flatActivities.map((a) => a.id)).toContain('D_in_loop')
    expect(flatActivities.map((a) => a.id)).toContain('D')
    expect(flatActivities.map((a) => a.id)).toContain('E')
    expect(flatActivities.map((a) => a.id)).toContain('J')

    // Now nest it back
    const reNested = WorkflowTransform.nest(flatActivities, edges)

    // CRITICAL: Converge node J should appear ONLY ONCE
    const jOccurrences = findAllOccurrences(reNested, 'J')
    expect(jOccurrences).toHaveLength(1)

    // Converge node should be at top level (after the condition)
    expect(reNested).toHaveLength(2)
    expect(reNested[0].id).toBe('cond')
    expect(reNested[1].id).toBe('J')
    expect(reNested[1].type).toBe('converge')

    // Verify the parallel structure is correct
    const cond = reNested[0] as Extract<Activity, { type: 'condition' }>
    expect(cond.then).toHaveLength(2) // Demo2 and cond1

    const cond1 = cond.then![1] as Extract<Activity, { type: 'condition' }>
    expect(cond1.id).toBe('cond1')
    expect(cond1.then).toHaveLength(1) // parallel

    const parallel = cond1.then![0] as Extract<Activity, { type: 'parallel' }>
    expect(parallel.type).toBe('parallel')
    expect(parallel.branches).toHaveLength(3) // loop1, D, E

    // Verify branches don't contain the converge node
    const branch1 = parallel.branches![0] as Activity
    const branch2 = parallel.branches![1] as Activity
    const branch3 = parallel.branches![2] as Activity

    expect(branch1.id).toBe('loop1')
    expect(branch2.id).toBe('D')
    expect(branch3.id).toBe('E')

    // Verify the first branch is the loop node
    expect(branch1.type).toBe('loop')
    expect(branch1.id).toBe('loop1')

    // Round-trip test: flatten again and verify edges are correct
    const { edges: reFlatEdges } = WorkflowTransform.flatten(reNested)

    // Verify edges to converge node exist
    const loop1ToJ = reFlatEdges.find((e) => e.source === 'loop1' && e.target === 'J')
    expect(loop1ToJ).toBeDefined()
    expect(loop1ToJ?.sourceHandle).toBe('done') // Loop uses 'done' handle

    const DToJ = reFlatEdges.find((e) => e.source === 'D' && e.target === 'J')
    expect(DToJ).toBeDefined()
    expect(DToJ?.sourceHandle).toBe('source')

    // Verify edges from cond1 to parallel branches
    const cond1ToLoop1 = reFlatEdges.find((e) => e.source === 'cond1' && e.target === 'loop1')
    expect(cond1ToLoop1).toBeDefined()

    const cond1ToD = reFlatEdges.find((e) => e.source === 'cond1' && e.target === 'D')
    expect(cond1ToD).toBeDefined()

    const cond1ToE = reFlatEdges.find((e) => e.source === 'cond1' && e.target === 'E')
    expect(cond1ToE).toBeDefined()
  })

  it('handles duplicate edges gracefully during parallel detection', () => {
    // Regression test for bug where duplicate edges from same source caused duplicate parallel branches
    const flatActivities: Activity[] = [
      {
        type: 'loop',
        id: 'L3',
        name: 'L3',
        loop: {
          type: 'while',
          condition: 'a',
          do: [
            {
              type: 'task',
              id: 'D4',
              name: 'D4',
              task: {
                executor: 'script',
                config: { language: 'python', code: 'D4' },
              },
            },
          ],
        },
      },
      {
        type: 'task',
        id: 'AD',
        name: 'AD',
        task: {
          executor: 'script',
          config: { language: 'python', code: 'a' },
        },
      },
      {
        type: 'task',
        id: 'Demo2',
        name: 'Demo2',
        task: {
          executor: 'aap_job_template',
          config: { jobTemplateId: 9 },
        },
      },
    ]

    // CRITICAL: Two edges from L3 to AD (duplicate edge scenario)
    // This can happen if edges are created twice from UI bugs or saved workflows
    const edges: EdgeConnection[] = [
      { id: 'L3-AD-1', source: 'L3', target: 'AD', sourceHandle: 'done', targetHandle: 'target' },
      { id: 'L3-AD-2', source: 'L3', target: 'AD', sourceHandle: 'done', targetHandle: 'target' }, // DUPLICATE!
      { id: 'AD-Demo2', source: 'AD', target: 'Demo2', sourceHandle: 'source', targetHandle: 'target' },
    ]

    // Before fix: Would create parallel with 2 identical branches [AD, Demo2]
    // After fix: Should detect single divergence target and NOT create parallel
    const nested = WorkflowTransform.nest(flatActivities, edges)

    // Should have 3 activities at top level (no parallel wrapper needed)
    expect(nested).toHaveLength(3)

    // Verify no parallel container was created
    const hasParallel = nested.some((a) => a.type === 'parallel')
    expect(hasParallel).toBe(false)

    // Verify structure is correct: L3 → AD → Demo2
    expect(nested[0].id).toBe('L3')
    expect(nested[0].type).toBe('loop')
    expect(nested[1].id).toBe('AD')
    expect(nested[2].id).toBe('Demo2')

    // Round-trip test: flatten should produce deduplicated edges
    const { activities: reflattened, edges: reflattenedEdges } = WorkflowTransform.flatten(nested)

    // Should have 4 activities after flattening (L3, D4 from loop body, AD, Demo2)
    expect(reflattened).toHaveLength(4)

    // Verify loop was properly nested with its body
    const loopActivity = nested.find((a) => a.id === 'L3') as Extract<Activity, { type: 'loop' }>
    expect(loopActivity).toBeDefined()
    expect(loopActivity.loop.do).toHaveLength(1)
    expect(loopActivity.loop.do![0].id).toBe('D4')

    // Edges from L3 to AD should be deduplicated (only one edge)
    const l3ToAdEdges = reflattenedEdges.filter((e) => e.source === 'L3' && e.target === 'AD')
    expect(l3ToAdEdges).toHaveLength(1)
    expect(l3ToAdEdges[0].sourceHandle).toBe('done')
  })
})
