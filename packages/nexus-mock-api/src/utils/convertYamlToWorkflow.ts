import type { WorkflowWithVersion, WorkflowDefinition } from 'nexus-contracts'
import { readFileSync } from 'fs'
import yaml from 'js-yaml'
import { basename } from 'path'

/**
 * Convert a YAML workflow definition file to a WorkflowWithVersion object
 */
export function convertYamlToWorkflow(
  yamlFilePath: string,
  id: string,
  createdBy = 'system',
): WorkflowWithVersion {
  // Read and parse YAML file
  const yamlContent = readFileSync(yamlFilePath, 'utf-8')
  const workflowDefinition = yaml.load(yamlContent) as WorkflowDefinition

  // Extract filename for default name
  const filename = basename(yamlFilePath, '.yaml')
  const name = workflowDefinition.metadata?.name || filename

  // Generate timestamps
  const timestamp = new Date().toISOString()

  return {
    id,
    name,
    description: workflowDefinition.metadata?.description || `Workflow: ${name}`,
    created_at: timestamp,
    updated_at: timestamp,
    created_by: createdBy,
    version: {
      workflow_definition: workflowDefinition,
    },
  }
}
