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
  // 'edge_cases/condition_comparisons.yaml',
  // 'edge_cases/error_condition_no_condition.yaml',
  // 'edge_cases/error_condition_no_then.yaml',
  // 'edge_cases/error_foreach_not_list.yaml',
  // 'edge_cases/error_invalid_duration.yaml',
  // 'edge_cases/error_loop_no_definition.yaml',
  // 'edge_cases/error_missing_task_definition.yaml',
  // 'edge_cases/error_parallel_no_branches.yaml',
  // 'edge_cases/error_sequence_no_steps.yaml',
  // 'edge_cases/error_unsupported_duration.yaml',
  // 'edge_cases/error_unsupported_executor.yaml',
  // 'edge_cases/error_unsupported_language.yaml',
  // 'edge_cases/expression_resolution.yaml',
  // 'edge_cases/output_mapping_json.yaml',
  // 'edge_cases/retry_policy.yaml',
  // 'edge_cases/script_failure.yaml',
  // 'error-handling/error-propagation.yaml',
  // 'error-handling/failing-task.yaml',
  // 'error-handling/transient-errors.yaml',
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
  // 'retry/linear-backoff-retry.yaml',
  'sequence/basic-sequence.yaml',
  'sequence/nested-sequence.yaml',
  'sequence/sequence-with-data-passing.yaml',
  // 'timeout-retry/activity-timeout.yaml',
  // 'timeout-retry/retry-policy.yaml',
  // 'timeout-retry/timeout-with-retry.yaml',
]

// Convert all YAML files to WorkflowWithVersion objects
export const workflows: WorkflowWithVersion[] = yamlFiles
  .map((file, index) => {
    const filePath = join(examplesDir, file)
    return convertYamlToWorkflow(filePath, (index + 1).toString(), 'system')
  })
  .sort((a, b) => a.name.localeCompare(b.name))
