/**
 * E2E Tests: Workflow Builder - Delete Nodes and Edges
 *
 * Objective: Verify that nodes and edges can be deleted from the canvas.
 *
 * Test coverage:
 * - Delete a middle node and verify connected edges are removed
 * - Delete first/last nodes in a sequence and verify remaining nodes stay on canvas
 */

import { test, expect } from '../fixtures'
import {
  buildUniqueName,
  deleteWorkflow,
  closeNodeEditorPanel,
  createWorkflowWithTrigger,
  addScriptNode,
  verifyNodeVisible,
} from '../helpers/workflows'

test('delete a middle node removes the node and its connected edges', async ({ app }) => {
  const workflowName = buildUniqueName('e2e-delete')
  await createWorkflowWithTrigger(app, workflowName)

  try {
    await closeNodeEditorPanel(app)
    await expect(app.getByText('Manual trigger')).toBeVisible()

    // Add three connected nodes: Manual trigger → Node A → Node B → Node C
    await addScriptNode(app, 'Node A', 'print("A")')
    await addScriptNode(app, 'Node B', 'print("B")')
    await addScriptNode(app, 'Node C', 'print("C")')

    // Layout to position nodes
    await app.getByRole('button', { name: 'Layout' }).click()

    // Verify all nodes are visible
    await verifyNodeVisible(app, 'Manual trigger')
    await verifyNodeVisible(app, 'Node A')
    await verifyNodeVisible(app, 'Node B')
    await verifyNodeVisible(app, 'Node C')

    // Count edges before deletion (should have 3: trigger→A, A→B, B→C)
    // ReactFlow edges are SVG paths with no accessible roles -- CSS locator is unavoidable
    const edgesBeforeDelete = app.locator('svg g.react-flow__edge')
    // ReactFlow sets visibility:hidden on off-screen edges so toBeVisible() fails — use toBeAttached().
    // Wrap count() in toPass() for auto-retry: count() is a snapshot and needs retry until DOM settles.
    let initialEdgeCount = 0
    await expect(async () => {
      initialEdgeCount = await edgesBeforeDelete.count()
      expect(initialEdgeCount).toBeGreaterThanOrEqual(3)
    }).toPass({ timeout: 10000 })

    // Delete Node B using its kebab menu
    const nodeB = app.locator('[role="group"][aria-roledescription="node"]').filter({ hasText: 'Node B' })
    await expect(nodeB).toBeVisible()

    // Click the kebab menu button on Node B
    const kebabButton = nodeB.getByLabel('Step actions menu')
    await expect(kebabButton).toBeVisible()
    await kebabButton.click()

    // Click Delete in the dropdown menu
    const deleteMenuItem = app.getByRole('menuitem', { name: 'Delete' })
    await expect(deleteMenuItem).toBeVisible()
    await deleteMenuItem.click()

    // Verify Node B is removed from canvas
    await expect(nodeB).not.toBeVisible()

    // Verify edges connected to Node B are removed
    // Should now have fewer edges (at least 2 edges removed: A→B and B→C)
    const edgesAfterDelete = app.locator('svg g.react-flow__edge')
    const finalEdgeCount = await edgesAfterDelete.count()
    expect(finalEdgeCount).toBeLessThan(initialEdgeCount)

    // Verify Node A and Node C remain on the canvas
    await verifyNodeVisible(app, 'Manual trigger')
    await verifyNodeVisible(app, 'Node A')
    await verifyNodeVisible(app, 'Node C')
  } finally {
    await deleteWorkflow(app, workflowName)
  }
})

const deletePositionCases = [
  {
    position: 'first',
    nodes: ['First', 'Second', 'Third'],
    deleteNode: 'First',
    remainingNodes: ['Second', 'Third'],
  },
  {
    position: 'last',
    nodes: ['Start', 'Middle', 'End'],
    deleteNode: 'End',
    remainingNodes: ['Start', 'Middle'],
  },
]

for (const { position, nodes, deleteNode, remainingNodes } of deletePositionCases) {
  test(`delete ${position} node in a sequence keeps other nodes`, async ({ app }) => {
    const workflowName = buildUniqueName('e2e-delete')
    await createWorkflowWithTrigger(app, workflowName)

    try {
      await closeNodeEditorPanel(app)
      await expect(app.getByText('Manual trigger')).toBeVisible()

      // Add nodes
      for (const nodeName of nodes) {
        await addScriptNode(app, nodeName, `print("${nodeName}")`)
      }

      await app.getByRole('button', { name: 'Layout' }).click()

      // Verify all nodes visible
      for (const nodeName of nodes) {
        await verifyNodeVisible(app, nodeName)
      }

      // Delete the specified node using kebab menu
      const targetNode = app.locator('[role="group"][aria-roledescription="node"]').filter({ hasText: deleteNode })
      await expect(targetNode).toBeVisible()

      const kebabButton = targetNode.getByLabel('Step actions menu')
      await expect(kebabButton).toBeVisible()
      await kebabButton.click()

      await app.getByRole('menuitem', { name: 'Delete' }).click()

      // Verify deleted node is removed
      await expect(targetNode).not.toBeVisible()

      // Verify remaining nodes are still visible
      await verifyNodeVisible(app, 'Manual trigger')
      for (const nodeName of remainingNodes) {
        await verifyNodeVisible(app, nodeName)
      }
    } finally {
      await deleteWorkflow(app, workflowName)
    }
  })
}
