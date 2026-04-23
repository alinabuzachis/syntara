import type { Workflow } from '@ansible/nexus-contracts'

/**
 * Tags in the UI are persisted as workflow.labels (key = tag name, value = '').
 * The list API returns workflow.labels; the Tags column shows these label keys.
 */
export function getWorkflowTagsFromLabels(workflow: Workflow): string[] {
  const labels = workflow.labels
  if (!labels || typeof labels !== 'object') return []
  return Object.keys(labels)
}

/**
 * Tags for the Workflows table. Single source of truth: workflow.labels (label keys).
 */
export function getWorkflowTagsForDisplay(workflow: Workflow): string[] {
  return getWorkflowTagsFromLabels(workflow)
}

/**
 * Converts Workflow.labels (key-value) to "key=value" strings for display.
 * Reserved for key=value display if needed; Tags column uses label keys via getWorkflowTagsForDisplay.
 */
export function getWorkflowLabelItems(workflow: Workflow): string[] {
  const labels = workflow.labels
  if (!labels || typeof labels !== 'object') return []
  return Object.entries(labels).map(([key, value]) => `${key}=${value}`)
}
