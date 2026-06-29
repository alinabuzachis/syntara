const AAP_JOB_TYPES = new Set(['aap_job_template', 'aap_workflow_job_template'])

export function isAAPNodeType(nodeType: string | undefined): boolean {
  return nodeType !== undefined && AAP_JOB_TYPES.has(nodeType)
}

export function extractAAPJobUrl(outputData: Record<string, unknown> | null | undefined): string | null {
  if (!outputData) return null
  const url = outputData.job_url ?? outputData.workflow_job_url
  if (typeof url !== 'string' || url.length === 0) return null
  if (!url.startsWith('https://') && !url.startsWith('http://')) return null
  return url
}
