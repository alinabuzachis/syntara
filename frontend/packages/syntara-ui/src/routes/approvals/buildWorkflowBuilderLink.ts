/** Builds the workflow builder route for an approval's linked workflow, including the version query param when known. */
export function buildWorkflowBuilderLink(workflowId: string, workflowVersion: number | null | undefined): string {
  const versionQuery = workflowVersion != null ? `?version=${String(workflowVersion)}` : ''
  return `/workflow-builder/${workflowId}${versionQuery}`
}
