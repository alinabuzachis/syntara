import { workflowFetchClient } from '../client'

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function sanitizeFilename(name: string): string {
  return name.replaceAll(/[^\w.-]/g, '_').toLowerCase()
}

const METADATA_KEYS = new Set(['schema_version', 'name', 'description'])

function stripMetadata(definition: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(definition).filter(([key]) => !METADATA_KEYS.has(key)))
}

export async function downloadWorkflowExportById(workflowId: string): Promise<void> {
  const { data, error } = await workflowFetchClient.GET('/workflows/{workflow_id}', {
    params: { path: { workflow_id: workflowId } },
  })

  if (error || !data) {
    throw new Error('Failed to fetch workflow details for export')
  }

  const definition = data.version?.workflow_definition

  if (!definition) {
    throw new Error('Workflow has no definition to export')
  }

  const name = data.name ?? 'workflow'
  const content = JSON.stringify(stripMetadata(definition as Record<string, unknown>), null, 2)
  const blob = new Blob([content], { type: 'application/json' })
  triggerDownload(blob, `${sanitizeFilename(name)}.json`)
}

export function downloadWorkflowDefinition(definition: Record<string, unknown>, workflowName: string): void {
  const content = JSON.stringify(stripMetadata(definition), null, 2)
  const blob = new Blob([content], { type: 'application/json' })
  triggerDownload(blob, `${sanitizeFilename(workflowName)}.json`)
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export function validateFileSize(file: File): void {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('File is too large. Maximum size is 10 MB.')
  }
}

function validateElements(items: unknown[], requiredKeys: string[], label: string): void {
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      throw new Error(`Each ${label} must be an object`)
    }
    for (const key of requiredKeys) {
      if (!(key in item)) {
        const fieldNames = requiredKeys.map((k) => '"' + k + '"').join(' and ')
        const suffix = requiredKeys.length > 1 ? 's' : ''
        throw new Error(`Each ${label} must have ${fieldNames} field${suffix}`)
      }
    }
  }
}

export function parseWorkflowFile(content: string, filename: string): Record<string, unknown> {
  const isJson = filename.toLowerCase().endsWith('.json')

  if (!isJson) {
    throw new Error('Only JSON files are supported')
  }

  const parsed: unknown = JSON.parse(content)

  if (!parsed || typeof parsed !== 'object') {
    throw new TypeError('File does not contain a valid workflow definition')
  }

  const definition = parsed as Record<string, unknown>

  if (definition.schema_version && definition.schema_version !== '2.0.0') {
    throw new Error(`Unsupported schema version: ${JSON.stringify(definition.schema_version)}. Expected 2.0.0`)
  }

  if (!Array.isArray(definition.triggers) || !Array.isArray(definition.nodes) || !Array.isArray(definition.edges)) {
    throw new TypeError('File is missing required workflow definition fields (triggers, nodes, edges must be arrays)')
  }

  validateElements(definition.nodes as unknown[], ['id', 'type'], 'node')
  validateElements(definition.triggers as unknown[], ['type'], 'trigger')
  validateElements(definition.edges as unknown[], ['from', 'to'], 'edge')

  return definition
}
