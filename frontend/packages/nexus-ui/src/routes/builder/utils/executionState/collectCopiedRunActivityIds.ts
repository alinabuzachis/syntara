/**
 * Collect activity and trigger IDs present in a workflow graph at copy-to-editor time.
 * Used as an allowlist so skip inference only applies to nodes from the copied run.
 */
export function collectCopiedRunActivityIds(workflow: {
  workflow: { activities: ReadonlyArray<{ id: string }> }
  triggers?: ReadonlyArray<{ id?: string }>
}): string[] {
  const ids = workflow.workflow.activities.map((activity) => activity.id)
  for (const trigger of workflow.triggers ?? []) {
    if (typeof trigger.id === 'string' && trigger.id.length > 0) {
      ids.push(trigger.id)
    }
  }
  return ids
}
