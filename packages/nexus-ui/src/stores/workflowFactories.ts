import type { WorkflowAPI } from '@ansible/nexus-contracts'

// ============================================================================
// Workflow Entity Factory Functions
// ============================================================================
// These functions create properly typed workflow entities.
// They are pure functions and don't interact with the store directly.
//
// Usage:
//   import { createManualTrigger, createScriptActivity } from './workflowFactories'
//   const trigger = createManualTrigger(true)
//   const activity = createScriptActivity('task-1', 'My Task', 'python', 'print("hello")')
// ============================================================================

// Type aliases from API contracts
type Activity = WorkflowAPI.components['schemas']['activity']
type TaskActivity = Extract<Activity, { type: 'task' }>

// ============================================================================
// Trigger Factory Functions
// ============================================================================

/**
 * Create a manual trigger.
 * @param requiresApproval - Whether the trigger requires approval before execution
 */
export function createManualTrigger(requiresApproval?: boolean): WorkflowAPI.components['schemas']['manualTrigger'] {
  return {
    type: 'manual',
    ...(requiresApproval !== undefined && { requiresApproval }),
  }
}

/**
 * Create a scheduled trigger.
 * @param scheduleType - Type of schedule: 'cron', 'interval', or 'continuous'
 * @param config - Schedule configuration
 * @note This trigger type is not yet in the API schema - using type assertion
 */
export function createScheduledTrigger(
  scheduleType: 'cron' | 'interval' | 'continuous',
  config: {
    cron?: string
    timezone?: string
    interval?: string
  }
) {
  if (scheduleType === 'cron' && config.cron) {
    return {
      type: 'scheduled',
      schedule: {
        scheduleType: 'cron',
        cron: config.cron,
        ...(config.timezone && { timezone: config.timezone }),
      },
    } as const
  } else if (scheduleType === 'interval' && config.interval) {
    return {
      type: 'scheduled',
      schedule: {
        scheduleType: 'interval',
        interval: config.interval,
      },
    } as const
  } else {
    return {
      type: 'scheduled',
      schedule: {
        scheduleType: 'continuous',
        continuous: true,
      },
    } as const
  }
}

/**
 * Create an event trigger.
 * @param source - Event source identifier
 * @param eventType - Type of event to trigger on
 * @param filter - Optional filter criteria
 * @note This trigger type is not yet in the API schema - using type assertion
 */
export function createEventTrigger(source: string, eventType: string, filter?: Record<string, unknown>) {
  return {
    type: 'event',
    event: {
      source,
      eventType,
      ...(filter && { filter }),
    },
  } as const
}

// ============================================================================
// Activity Factory Functions
// ============================================================================

/**
 * Create a script activity.
 * @param id - Unique activity identifier
 * @param name - Display name for the activity
 * @param language - Script language: 'python', 'javascript', 'bash', or 'powershell'
 * @param code - Script code to execute
 * @param inputs - Optional JSON string of input parameters
 * @note API schema currently only supports 'python' and 'bash' - using type assertion for forward compatibility
 */
export function createScriptActivity(
  id: string,
  name: string,
  language: 'python' | 'javascript' | 'bash' | 'powershell',
  code: string,
  inputs?: string
): TaskActivity {
  const activity: TaskActivity = {
    type: 'task',
    id,
    name,
    task: {
      executor: 'script',
      config: {
        language: language as 'python' | 'bash',
        code,
      },
    },
  }

  if (inputs) {
    try {
      activity.task.inputs = JSON.parse(inputs)
    } catch {
      // If inputs is not valid JSON, skip it
    }
  }

  return activity
}

/**
 * Create an API activity.
 * @param id - Unique activity identifier
 * @param name - Display name for the activity
 * @param method - HTTP method
 * @param url - API endpoint URL
 * @param headers - Optional JSON string of HTTP headers
 * @param body - Optional JSON string of request body
 * @param inputs - Optional JSON string of input parameters
 */
export function createApiActivity(
  id: string,
  name: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  headers?: string,
  body?: string,
  inputs?: string
): TaskActivity {
  const config: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    url: string
    headers?: { [key: string]: string }
    body?: unknown
  } = {
    method,
    url,
  }

  if (headers) {
    try {
      config.headers = JSON.parse(headers) as { [key: string]: string }
    } catch {
      // If headers is not valid JSON, skip it
    }
  }

  if (body) {
    try {
      config.body = JSON.parse(body)
    } catch {
      // If body is not valid JSON, use as string
      config.body = body
    }
  }

  const activity: TaskActivity = {
    type: 'task',
    id,
    name,
    task: {
      executor: 'api',
      config,
    },
  }

  if (inputs) {
    try {
      activity.task.inputs = JSON.parse(inputs)
    } catch {
      // If inputs is not valid JSON, skip it
    }
  }

  return activity
}

/**
 * Create an agentic activity (AI agent with MCP server integration).
 * @param id - Unique activity identifier
 * @param name - Display name for the activity
 * @param tools - Optional array of tool names available to the agent
 * @param prompt - Optional natural language prompt for the agent
 * @param model - Optional LLM model to use
 * @param inputs - Optional JSON string of input parameters
 */
export function createAgenticActivity(
  id: string,
  name: string,
  tools?: string[],
  prompt?: string,
  model?: string,
  inputs?: string
): TaskActivity {
  const config: {
    agent: string
    tools?: string[]
    prompt?: string
    model?: string
  } = {
    agent: '', // Default empty string since UI doesn't collect this field
  }

  if (tools && tools.length > 0) {
    config.tools = tools
  }

  if (prompt) {
    config.prompt = prompt
  }

  if (model) {
    config.model = model
  }

  const activity: TaskActivity = {
    type: 'task',
    id,
    name,
    task: {
      executor: 'agentic',
      config,
    },
  }

  if (inputs) {
    try {
      activity.task.inputs = JSON.parse(inputs)
    } catch {
      // If inputs is not valid JSON, skip it
    }
  }

  return activity
}

/**
 * Create a condition activity.
 * @param id - Unique activity identifier
 * @param name - Display name for the activity
 * @param condition - Condition expression to evaluate
 */
export function createConditionActivity(
  id: string,
  name: string,
  condition: string
): Extract<Activity, { type: 'condition' }> {
  // The 'then' and 'else' properties are required by the workflow API schema for condition nodes.
  // This is a workflow domain object representing conditional branching, NOT a JavaScript Promise.
  // SonarCloud flags 'then' properties as potential Promise confusion - suppressing this false positive.
  return {
    type: 'condition',
    id,
    name,
    condition,
    then: [], // NOSONAR - This is a workflow branch property, not a Promise thenable
    else: [],
  }
}

/**
 * Create a loop activity.
 * @param id - Unique activity identifier
 * @param name - Display name for the activity
 * @param loopType - Type of loop: 'forEach' or 'while'
 * @param config - Loop configuration
 */
export function createLoopActivity(
  id: string,
  name: string,
  loopType: 'forEach' | 'while',
  config: {
    items?: string
    condition?: string
    maxIterations?: number
    indexVariable?: string
    itemVariable?: string
  }
): Extract<Activity, { type: 'loop' }> {
  const baseActivity = {
    type: 'loop' as const,
    id,
    name,
    loop: {
      type: loopType,
      do: [],
    },
  }

  if (loopType === 'forEach' && config.items) {
    return {
      ...baseActivity,
      loop: {
        ...baseActivity.loop,
        type: 'forEach' as const,
        items: config.items,
        itemVariable: config.itemVariable,
        indexVariable: config.indexVariable,
      },
    }
  } else if (loopType === 'while' && config.condition) {
    const whileLoop: Extract<Activity, { type: 'loop' }>['loop'] = {
      ...baseActivity.loop,
      type: 'while' as const,
      condition: config.condition,
    }

    // Only include maxIterations if it has a valid value
    if (config.maxIterations !== undefined && config.maxIterations !== null && !Number.isNaN(config.maxIterations)) {
      whileLoop.maxIterations = config.maxIterations
    }

    return {
      ...baseActivity,
      loop: whileLoop,
    }
  }

  // Fallback - should not happen if form validation works
  // Default to forEach with empty items to satisfy type requirements
  return {
    ...baseActivity,
    loop: {
      type: 'forEach' as const,
      items: '',
      do: [],
    },
  }
}

/**
 * Create a converge activity (for parallel workflow synchronization).
 * @param id - Unique activity identifier
 * @param name - Display name for the activity
 * @param config - Optional converge configuration
 */
export function createConvergeActivity(
  id: string,
  name: string,
  config?: {
    timeout?: number
    onTimeout?: 'continue' | 'fail'
    aggregateOutputs?: boolean
  }
): Extract<Activity, { type: 'converge' }> {
  const convergeActivity: Extract<Activity, { type: 'converge' }> = {
    type: 'converge',
    id,
    name,
    converge: {
      branches: [], // Will be populated based on incoming edges
      strategy: 'all', // Only 'all' strategy is supported
      timeout: config?.timeout,
      onTimeout: config?.onTimeout,
      aggregateOutputs: config?.aggregateOutputs,
    },
  }

  return convergeActivity
}

/**
 * Create an AAP Job Template activity.
 * @param id - Unique activity identifier
 * @param name - Display name for the activity
 * @param jobTemplateId - AAP job template ID to launch
 * @param config - Optional configuration (inventory, credentials, extraVars, etc.)
 * @note The 'aap_job_template' executor is not yet in the API schema - using type assertion
 */
export function createAAPJobTemplateActivity(
  id: string,
  name: string,
  jobTemplateId: number,
  config?: {
    inventory?: number
    credentials?: number[]
    extraVars?: Record<string, unknown>
    limit?: string
    tags?: string
    skipTags?: string
    verbosity?: number
  }
): TaskActivity {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activity: any = {
    type: 'task',
    id,
    name,
    task: {
      executor: 'aap_job_template',
      config: {
        jobTemplateId,
        ...config,
      },
    },
  }

  return activity as TaskActivity
}

/**
 * Create a connector activity (for external integrations).
 * @param id - Unique activity identifier
 * @param name - Display name for the activity
 * @param connectorId - ID of the connector to use
 * @param operation - Operation to perform
 * @param parameters - Optional JSON string of operation parameters
 */
export function createConnectorActivity(
  id: string,
  name: string,
  connectorId: string,
  operation: string,
  parameters?: string
): TaskActivity {
  // Parse parameters if provided
  let parsedParameters: { [key: string]: unknown } | undefined
  if (parameters) {
    try {
      parsedParameters = JSON.parse(parameters)
    } catch {
      // If parameters is not valid JSON, skip it
    }
  }

  const activity: TaskActivity = {
    type: 'task',
    id,
    name,
    task: {
      executor: 'connector',
      config: {
        connectorId,
        operation,
        ...(parsedParameters && { parameters: parsedParameters }),
      },
    },
  }

  return activity
}

/**
 * Create a generic placeholder activity that can be replaced with any node type.
 * @param id - Unique activity identifier
 * @param name - Display name (defaults to 'New Node')
 * @param customMessage - Optional custom message for the placeholder
 */
export function createGenericActivity(id: string, name: string = 'New Node', customMessage?: string): TaskActivity {
  // Generic placeholder node - minimal task structure without executor details
  // The __isGeneric metadata flag marks this as a placeholder that should be replaced
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activity: any = {
    type: 'task',
    id,
    name,
    metadata: {
      __isGeneric: true, // Flag to identify this as a placeholder node
      ...(customMessage ? { __customMessage: customMessage } : {}),
    },
    // Minimal task config - no executor specified to avoid confusion
    task: {
      config: {},
    },
  }

  return activity as TaskActivity
}

/**
 * Create an approval activity - a task that requires human approval before execution.
 * @param id - Unique activity identifier
 * @param name - Display name for the activity
 * @param approvers - List of email addresses of users who can approve
 * @param prompt - Message displayed to approvers explaining what they're approving
 * @param timeout - Optional ISO 8601 duration string (e.g., 'PT1H' for 1 hour, 'P1D' for 1 day)
 * @param onTimeout - Action to take when timeout expires: 'fail', 'approve', or 'reject'
 */
export function createApprovalActivity(
  id: string,
  name: string,
  approvers: string[],
  prompt: string,
  timeout?: number,
  onTimeout?: 'fail' | 'approve' | 'reject'
): TaskActivity {
  // Approval nodes are represented as generic tasks with requiresApproval flag
  // and approval configuration containing the approval gate details
  // Note: metadata is not in the API schema but is used by the UI to identify node types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activity: any = {
    type: 'task',
    id,
    name,
    // Mark this activity as requiring approval
    requiresApproval: true,
    // Approval configuration matching backend API structure
    approval: {
      approvers,
      prompt,
      ...(timeout && { timeout }),
      ...(onTimeout && { onTimeout }),
    },
    // Add metadata to identify this as an approval node and display correct icon
    metadata: {
      __executorType: 'approval',
    },
    // Minimal task config - approval nodes don't execute code
    task: {
      executor: 'script',
      config: {
        language: 'python',
        code: '# Approval gate - execution pauses here until approved',
      },
    },
  }

  return activity as TaskActivity
}
