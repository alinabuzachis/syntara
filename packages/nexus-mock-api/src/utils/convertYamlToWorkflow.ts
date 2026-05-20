import { WorkflowVersionStatusEnum, type WorkflowAPI } from '@ansible/nexus-contracts'
import { readFileSync } from 'fs'
import yaml from 'js-yaml'
import { basename } from 'path'

type WorkflowWithVersion = WorkflowAPI.components['schemas']['WorkflowWithVersion']
type WorkflowDefinition = WorkflowAPI.components['schemas']['WorkflowDefinition']

/**
 * Convert a YAML workflow definition file to a WorkflowWithVersion object
 */
export function convertYamlToWorkflow(yamlFilePath: string, id: string, createdBy = 'system'): WorkflowWithVersion {
  // Read and parse YAML file
  const yamlContent = readFileSync(yamlFilePath, 'utf-8')
  const workflowDefinition = yaml.load(yamlContent) as WorkflowDefinition

  // Extract filename for default name (v2: top-level name, v1 fallback: metadata.name)
  const filename = basename(yamlFilePath, '.yaml')
  const def = workflowDefinition as Record<string, unknown>
  const name = (def.name as string) || workflowDefinition.metadata?.name || filename
  const description = (def.description as string) || workflowDefinition.metadata?.description || `Workflow: ${name}`

  // Generate timestamps
  const timestamp = new Date().toISOString()

  return {
    id,
    name,
    description,
    created_at: timestamp,
    updated_at: timestamp,
    created_by: createdBy,
    labels: {},
    current_version: 1,
    published_version: null,
    version: {
      workflow_definition: workflowDefinition,
      version: 1,
      status: WorkflowVersionStatusEnum.DRAFT,
    },
  }
}
