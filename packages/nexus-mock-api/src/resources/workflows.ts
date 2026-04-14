import type { WorkflowWithVersion } from '@ansible/nexus-contracts'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { convertYamlToWorkflow } from '../utils/convertYamlToWorkflow'

// Get the directory of this module
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const examplesDir = join(__dirname, '../examples')

// Import all YAML workflow files
const yamlFiles = [
  'basic/conditional-demo.yaml',
  'basic/hello-world.yaml',
  'basic/loop-demo.yaml',
  'basic/parallel-demo.yaml',
  'basic/retry-demo.yaml',
  'condition/basic-condition-then-else.yaml',
  'condition/condition-no-else-branch.yaml',
  'condition/condition-with-multiple-branches.yaml',
  'conditionals/nested-conditions.yaml',
  'conditionals/positive-negative-zero.yaml',
  'edge_cases/condition_comparisons.yaml',
  'edge_cases/expression_resolution.yaml',
  'edge_cases/output_mapping_json.yaml',
  'edge_cases/retry_policy.yaml',
  'edge_cases/script_failure.yaml',
  'error-handling/error-propagation.yaml',
  'error-handling/failing-task.yaml',
  'error-handling/transient-errors.yaml',
  'join/join-aggregate-outputs.yaml',
  'join/join-all-strategy.yaml',
  'join/join-any-strategy.yaml',
  'join/join-count-strategy.yaml',
  'join/join-majority-strategy.yaml',
  'join/join-missing-branch.yaml',
  'join/join-nested-parallel.yaml',
  'join/join-sequential.yaml',
  'join/join-timeout-continue.yaml',
  'join/join-timeout-fail.yaml',
  'join/join-with-post-join-activities.yaml',
  'loops/count-loop-basic.yaml',
  'loops/count-loop-with-index.yaml',
  'loops/foreach-items.yaml',
  'loops/while-loop-basic.yaml',
  'loops/while-loop-with-max-iterations.yaml',
  'metadata/workflow-with-all-metadata.yaml',
  'metadata/workflow-with-tags.yaml',
  'metadata/workflow-with-timeout.yaml',
  'parallel/parallel-tasks.yaml',
  'parameters/activity-chaining.yaml',
  'parameters/input-expressions.yaml',
  'retry/linear-backoff-retry.yaml',
  'sequence/basic-sequence.yaml',
  'sequence/nested-sequence.yaml',
  'sequence/sequence-with-data-passing.yaml',
  'timeout-retry/activity-timeout.yaml',
  'timeout-retry/retry-policy.yaml',
  'timeout-retry/timeout-with-retry.yaml',
]

// Project IDs to distribute workflows across
const projectIds = ['p-001', 'p-002']

// Convert all YAML files to WorkflowWithVersion objects
export const workflows: (WorkflowWithVersion & { project_id: string })[] = yamlFiles
  .map((file, index) => {
    const filePath = join(examplesDir, file)
    const workflow = convertYamlToWorkflow(filePath, (index + 1).toString(), 'system')
    return { ...workflow, project_id: projectIds[index % projectIds.length] }
  })
  .sort((a, b) => a.name.localeCompare(b.name))
