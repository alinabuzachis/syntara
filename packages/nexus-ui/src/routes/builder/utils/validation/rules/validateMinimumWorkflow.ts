import type { Activity } from '@ansible/nexus-contracts'

import type { EdgeConnection } from '../../../types/edge'
import type { ValidationError } from '../types'

/**
 * Validates that a workflow has the minimum required components to execute.
 *
 * A runnable workflow must have:
 * 1. At least one trigger
 * 2. At least one activity node
 * 3. At least one edge connecting a trigger to an activity
 *
 * This validation is intended for execution-time, not save-time.
 * Users should be able to save incomplete workflows, but not run them.
 */
export function validateMinimumWorkflow(
  activities: Activity[],
  edges: EdgeConnection[],
  triggers?: unknown[]
): ValidationError[] {
  const errors: ValidationError[] = []

  // Check for at least one trigger
  if (!triggers || triggers.length === 0) {
    errors.push({
      id: 'minimum-workflow-no-trigger',
      severity: 'error',
      rule: 'minimum-workflow',
      message: 'Workflow must have at least one trigger to run',
      suggestion: 'Add a trigger (e.g., Manual, Scheduled, or Webhook) from the step palette',
    })
  }

  // Check for at least one activity
  if (activities.length === 0) {
    errors.push({
      id: 'minimum-workflow-no-activities',
      severity: 'error',
      rule: 'minimum-workflow',
      message: 'Workflow must have at least one step to run',
      suggestion: 'Add a step (e.g., Script, HTTP Request, or AAP Job) from the step palette',
    })
  }

  // Check for at least one edge (connection between nodes)
  if (edges.length === 0 && activities.length > 0 && triggers && triggers.length > 0) {
    errors.push({
      id: 'minimum-workflow-no-connections',
      severity: 'error',
      rule: 'minimum-workflow',
      message: 'Workflow must have at least one connection between trigger and steps',
      suggestion: 'Connect your trigger to a step by dragging from the trigger output to the step input',
    })
  }

  return errors
}
