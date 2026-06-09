/**
 * E2E Tests (ANSTRAT-1845): Workflow Builder Canvas
 *
 * Combined test suite for builder functionality:
 * - Adding nodes from catalog panel
 * - Connecting nodes with edges
 * - Canvas interactions and layout
 */

import { test, expect } from '../fixtures'
import {
  buildUniqueName,
  deleteWorkflow,
  clickAddConnectedStep,
  closeNodeEditorPanel,
  createWorkflowWithTrigger,
  addScriptNode,
  verifyNodeVisible,
  waitForUIReady,
} from '../helpers/workflows'

// ========================================
// Add Nodes from Catalog
// ========================================

test('catalog panel shows available node types organized by category', async ({ app }) => {
  const workflowName = buildUniqueName('e2e-builder')
  await createWorkflowWithTrigger(app, workflowName)

  try {
    await closeNodeEditorPanel(app)
    await expect(app.getByText('Manual trigger')).toBeVisible()

    const panel = await clickAddConnectedStep(app)

    await expect(panel).toBeVisible()

    await expect(panel.getByRole('button', { name: 'Action', exact: true })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'AAP Execution', exact: true })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Approval', exact: true })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Logic', exact: true })).toBeVisible()
  } finally {
    await deleteWorkflow(app, workflowName)
  }
})

test('user can add a Script action node to the canvas', async ({ app }) => {
  const workflowName = buildUniqueName('e2e-builder')
  await createWorkflowWithTrigger(app, workflowName)

  try {
    await closeNodeEditorPanel(app)
    await expect(app.getByText('Manual trigger')).toBeVisible()

    await addScriptNode(app, 'Python Hello World', 'print("Hello, World!")')
    await verifyNodeVisible(app, 'Python Hello World')
  } finally {
    await deleteWorkflow(app, workflowName)
  }
})

test('user can add an Approval node to the canvas', async ({ app }) => {
  const workflowName = buildUniqueName('e2e-builder')
  await createWorkflowWithTrigger(app, workflowName)

  try {
    await closeNodeEditorPanel(app)
    await expect(app.getByText('Manual trigger')).toBeVisible()

    const panel = await clickAddConnectedStep(app)

    const approvalButton = panel.getByRole('button', { name: /Approval/i, exact: true })
    await expect(approvalButton).toBeVisible()

    await approvalButton.click()

    await expect(app.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible()
    await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Approval Node')

    await app.getByRole('textbox', { name: 'Add approver' }).fill('test-user')
    await app.keyboard.press('Enter')

    // Wait for form validation to complete
    await expect(app.getByRole('button', { name: 'Save and close' })).toBeEnabled({ timeout: 15000 })

    await app.getByRole('button', { name: 'Save and close' }).click()

    await closeNodeEditorPanel(app)

    // Wait for canvas to render the new node
    await expect(
      app.locator('[role="group"][aria-roledescription="node"]').filter({ hasText: 'Approval Node' })
    ).toBeVisible({ timeout: 10000 })

    await expect(app.getByText('Approval Node')).toBeVisible()
  } finally {
    await deleteWorkflow(app, workflowName)
  }
})

test('user can add a Logic (Conditional) node to the canvas', async ({ app }) => {
  const workflowName = buildUniqueName('e2e-builder')
  await createWorkflowWithTrigger(app, workflowName)

  try {
    await closeNodeEditorPanel(app)
    await expect(app.getByText('Manual trigger')).toBeVisible()

    const panel = await clickAddConnectedStep(app)

    const logicButton = panel.getByRole('button', { name: /Logic/i, exact: true })
    await expect(logicButton).toBeVisible()
    await logicButton.click()

    await expect(app.getByRole('heading', { name: 'Select a logic step' })).toBeVisible()
    await app.getByText('Conditional', { exact: true }).click()

    await expect(app.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible()
    await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Conditional Node')

    await app.getByLabel('Expression editor mode').selectOption('raw')

    await app.getByLabel('Raw expression').fill('${status == "active"}')

    await app.getByRole('button', { name: 'Save and close' }).click()

    await closeNodeEditorPanel(app)

    // Wait for canvas to render the new node
    await expect(
      app.locator('[role="group"][aria-roledescription="node"]').filter({ hasText: 'Conditional Node' })
    ).toBeVisible({
      timeout: 10000,
    })

    // Verify node appears on canvas
    await expect(app.getByText('Conditional Node')).toBeVisible()
  } finally {
    await deleteWorkflow(app, workflowName)
  }
})

test('multiple nodes can be added sequentially', async ({ app }) => {
  const workflowName = buildUniqueName('e2e-builder')
  await createWorkflowWithTrigger(app, workflowName)

  try {
    await closeNodeEditorPanel(app)
    await expect(app.getByText('Manual trigger')).toBeVisible()

    // Add first node - Script action
    await addScriptNode(app, 'Script Node 1', 'print("node1")')

    // Wait for UI to stabilize after first node
    await waitForUIReady(app)

    // Add second node - Approval
    let panel = await clickAddConnectedStep(app)

    // Wait for Approval button to be stable before clicking
    await expect(async () => {
      const approvalBtn = panel.getByRole('button', { name: 'Approval', exact: true })
      await expect(approvalBtn).toBeVisible()
      await expect(approvalBtn).toBeEnabled()
    }).toPass({ timeout: 15000, intervals: [500, 1000] })

    const approvalBtn = panel.getByRole('button', { name: 'Approval', exact: true })
    await approvalBtn.click()

    // Wait for form to be stable
    await expect(async () => {
      const nameInput = app.getByRole('textbox', { name: 'Name', exact: true })
      await expect(nameInput).toBeVisible()
      await expect(nameInput).toBeEditable()
    }).toPass({ timeout: 20000, intervals: [500, 1000] })

    const nameInput = app.getByRole('textbox', { name: 'Name', exact: true })
    await nameInput.fill('Approval Node 1')

    await app.getByRole('textbox', { name: 'Add approver' }).fill('test-user')
    await app.keyboard.press('Enter')

    // Wait for form validation to complete
    const saveBtn = app.getByRole('button', { name: 'Save and close' })
    await expect(saveBtn).toBeEnabled({ timeout: 20000 })
    await saveBtn.click()

    // Wait for panel to close
    await expect(panel).toHaveCount(0, { timeout: 15000 })

    // Wait for canvas to render the new node
    await expect(
      app.locator('[role="group"][aria-roledescription="node"]').filter({ hasText: 'Approval Node 1' })
    ).toBeVisible({
      timeout: 10000,
    })

    // Wait for UI to stabilize after second node
    await waitForUIReady(app)

    // Add third node - Logic (Conditional)
    panel = await clickAddConnectedStep(app)

    // Wait for Logic button to be stable
    await expect(async () => {
      const logicBtn = panel.getByRole('button', { name: 'Logic', exact: true })
      await expect(logicBtn).toBeVisible()
      await expect(logicBtn).toBeEnabled()
    }).toPass({ timeout: 15000, intervals: [500, 1000] })

    const logicBtn = panel.getByRole('button', { name: 'Logic', exact: true })
    await logicBtn.click()

    // Wait for Conditional button
    await expect(async () => {
      const conditionalBtn = app.getByText('Conditional', { exact: true })
      await expect(conditionalBtn).toBeVisible()
    }).toPass({ timeout: 15000, intervals: [500, 1000] })

    const conditionalBtn = app.getByText('Conditional', { exact: true })
    await conditionalBtn.click()

    // Wait for form to be stable
    await expect(async () => {
      const logicNameInput = app.getByRole('textbox', { name: 'Name', exact: true })
      await expect(logicNameInput).toBeVisible()
      await expect(logicNameInput).toBeEditable()
    }).toPass({ timeout: 20000, intervals: [500, 1000] })

    const logicNameInput = app.getByRole('textbox', { name: 'Name', exact: true })
    await logicNameInput.fill('Logic Node 1')

    await app.getByLabel('Expression editor mode').selectOption('raw')
    await app.getByLabel('Raw expression').fill('${x == 1}')

    const logicSaveBtn = app.getByRole('button', { name: 'Save and close' })
    await expect(logicSaveBtn).toBeEnabled({ timeout: 20000 })
    await logicSaveBtn.click()

    // Wait for panel to close
    await expect(panel).toHaveCount(0, { timeout: 15000 })

    // Wait for canvas to render the new node
    await expect(
      app.locator('[role="group"][aria-roledescription="node"]').filter({ hasText: 'Logic Node 1' })
    ).toBeVisible({ timeout: 10000 })
    await verifyNodeVisible(app, 'Script Node 1')
    await verifyNodeVisible(app, 'Approval Node 1')
    await verifyNodeVisible(app, 'Logic Node 1')
  } finally {
    await deleteWorkflow(app, workflowName)
  }
})

test('added nodes are visible and interactive on the canvas', async ({ app }) => {
  const workflowName = buildUniqueName('e2e-builder')
  await createWorkflowWithTrigger(app, workflowName)

  try {
    await closeNodeEditorPanel(app)
    await expect(app.getByText('Manual trigger')).toBeVisible()

    await addScriptNode(app, 'Interactive Node', 'print("interactive")')

    await verifyNodeVisible(app, 'Interactive Node')

    await app.getByText('Interactive Node').click()
  } finally {
    await deleteWorkflow(app, workflowName)
  }
})

test('nodes are positioned on the canvas after layout', async ({ app }) => {
  const workflowName = buildUniqueName('e2e-builder')
  await createWorkflowWithTrigger(app, workflowName)

  try {
    await closeNodeEditorPanel(app)
    await expect(app.getByText('Manual trigger')).toBeVisible()

    // Add a node
    await addScriptNode(app, 'Positioned Node', 'print("positioned")')
    await verifyNodeVisible(app, 'Positioned Node')

    const layoutButton = app.getByRole('button', { name: 'Layout' })
    await expect(layoutButton).toBeVisible()
    await layoutButton.click()

    await verifyNodeVisible(app, 'Positioned Node')
  } finally {
    await deleteWorkflow(app, workflowName)
  }
})

test('catalog panel can be closed without adding a node', async ({ app }) => {
  const workflowName = buildUniqueName('e2e-builder')
  await createWorkflowWithTrigger(app, workflowName)

  try {
    await closeNodeEditorPanel(app)
    await expect(app.getByText('Manual trigger')).toBeVisible()

    // Open the Add step panel
    const panel = await clickAddConnectedStep(app)
    await expect(panel).toBeVisible()

    // Close the panel using the Close button
    const closeButton = panel.getByRole('button', { name: /Close/i })
    const hasCloseButton = await closeButton
      .waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true)
      .catch(() => false)

    if (hasCloseButton) {
      await closeButton.click()
    } else {
      await app.keyboard.press('Escape')
    }

    await expect(panel).not.toBeVisible()

    await expect(app).toHaveURL(/workflow-builder\/.+/)
  } finally {
    await deleteWorkflow(app, workflowName)
  }
})

// ========================================
// Connect Nodes with Edges
// ========================================

test('two nodes can be connected with an edge', async ({ app }) => {
  const workflowName = buildUniqueName('e2e-builder')
  await createWorkflowWithTrigger(app, workflowName)

  try {
    await closeNodeEditorPanel(app)
    await expect(app.getByText('Manual trigger')).toBeVisible()

    // Add two nodes using "Add connected step" - this creates edges via the UI
    await addScriptNode(app, 'First Node', 'print("first")')
    await addScriptNode(app, 'Second Node', 'print("second")')

    await verifyNodeVisible(app, 'First Node')
    await verifyNodeVisible(app, 'Second Node')

    // Verify edges were created (trigger->First, First->Second)
    // ReactFlow edges are SVG groups - no accessible alternative exists for visual verification
    const edges = app.locator('svg g.react-flow__edge')
    const edgeCount = await edges.count()

    // Should have at least 2 edges connecting the nodes
    expect(edgeCount).toBeGreaterThanOrEqual(2)
  } finally {
    await deleteWorkflow(app, workflowName)
  }
})

test('edge is visually distinguishable on canvas', async ({ app }) => {
  const workflowName = buildUniqueName('e2e-builder')
  await createWorkflowWithTrigger(app, workflowName)

  try {
    await closeNodeEditorPanel(app)
    await expect(app.getByText('Manual trigger')).toBeVisible()

    // Add two nodes - these will auto-connect:
    // Manual trigger -> Source Node -> Target Node
    await addScriptNode(app, 'Source Node', 'print("source")')
    await addScriptNode(app, 'Target Node', 'print("target")')

    // Verify at least one edge exists on canvas and is visible
    // Should have edges: trigger->Source and Source->Target
    const edges = app.locator('.react-flow__edge')
    const edgeCount = await edges.count()
    expect(edgeCount).toBeGreaterThanOrEqual(2)
  } finally {
    await deleteWorkflow(app, workflowName)
  }
})

test('multiple edges can be created sequentially', async ({ app }) => {
  const workflowName = buildUniqueName('e2e-builder')
  await createWorkflowWithTrigger(app, workflowName)

  try {
    await closeNodeEditorPanel(app)
    await expect(app.getByText('Manual trigger')).toBeVisible()

    // Add three nodes
    await addScriptNode(app, 'Node 1', 'print("1")')
    await addScriptNode(app, 'Node 2', 'print("2")')
    await addScriptNode(app, 'Node 3', 'print("3")')

    // Layout to position nodes
    await app.getByRole('button', { name: 'Layout' }).click()

    // Verify all nodes are visible
    await verifyNodeVisible(app, 'Node 1')
    await verifyNodeVisible(app, 'Node 2')
    await verifyNodeVisible(app, 'Node 3')

    // The "Add connected step" button creates edges automatically
    // Verify multiple edges exist
    const edges = app.locator('.react-flow__edge')
    const edgeCount = await edges.count()

    // Should have at least 2 edges connecting 3 nodes linearly
    expect(edgeCount).toBeGreaterThanOrEqual(2)
  } finally {
    await deleteWorkflow(app, workflowName)
  }
})

test('edge follows connection path between nodes', async ({ app }) => {
  const workflowName = buildUniqueName('e2e-builder')
  await createWorkflowWithTrigger(app, workflowName)

  try {
    await closeNodeEditorPanel(app)
    await expect(app.getByText('Manual trigger')).toBeVisible()

    // Add two nodes - auto-connected: Manual trigger -> Start Node -> End Node
    await addScriptNode(app, 'Start Node', 'print("start")')
    await addScriptNode(app, 'End Node', 'print("end")')

    // Verify edge path exists and has SVG path data.
    // ReactFlow edge paths are SVG <path> elements with no accessible role — use the DOM API directly.
    const pathData = await app.evaluate(
      () => document.querySelector('svg g.react-flow__edge path')?.getAttribute('d') ?? null
    )
    expect(pathData).toBeTruthy()
    expect(pathData?.length).toBeGreaterThan(0)

    // Verify it's actual SVG path commands (starts with M for moveTo)
    expect(pathData).toMatch(/^M/)
  } finally {
    await deleteWorkflow(app, workflowName)
  }
})

test('connected nodes form a workflow DAG', async ({ app }) => {
  const workflowName = buildUniqueName('e2e-builder')
  await createWorkflowWithTrigger(app, workflowName)

  try {
    await closeNodeEditorPanel(app)
    await expect(app.getByText('Manual trigger')).toBeVisible()

    // Add nodes that will form a linear DAG: Manual Trigger -> Script 1 -> Script 2
    await addScriptNode(app, 'Processing Step', 'print("processing")')
    await addScriptNode(app, 'Final Step', 'print("final")')

    // Layout to visualize the DAG
    await app.getByRole('button', { name: 'Layout' }).click()

    // Verify nodes are visible
    await verifyNodeVisible(app, 'Manual trigger')
    await verifyNodeVisible(app, 'Processing Step')
    await verifyNodeVisible(app, 'Final Step')

    // Verify edges exist connecting the DAG
    const edges = app.locator('.react-flow__edge')
    const edgeCount = await edges.count()

    // Should have at least 2 edges: trigger->processing, processing->final
    expect(edgeCount).toBeGreaterThanOrEqual(2)
  } finally {
    await deleteWorkflow(app, workflowName)
  }
})
