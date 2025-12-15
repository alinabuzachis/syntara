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
 */
export function createScheduledTrigger(
  scheduleType: 'cron' | 'interval' | 'continuous',
  config: {
    cron?: string
    timezone?: string
    interval?: string
  }
): WorkflowAPI.components['schemas']['scheduledTrigger'] {
  if (scheduleType === 'cron' && config.cron) {
    return {
      type: 'scheduled',
      schedule: {
        scheduleType: 'cron',
        cron: config.cron,
        ...(config.timezone && { timezone: config.timezone }),
      },
    }
  } else if (scheduleType === 'interval' && config.interval) {
    return {
      type: 'scheduled',
      schedule: {
        scheduleType: 'interval',
        interval: config.interval,
      },
    }
  } else {
    return {
      type: 'scheduled',
      schedule: {
        scheduleType: 'continuous',
        continuous: true,
      },
    }
  }
}

/**
 * Create an event trigger.
 * @param source - Event source identifier
 * @param eventType - Type of event to trigger on
 * @param filter - Optional filter criteria
 */
export function createEventTrigger(
  source: string,
  eventType: string,
  filter?: Record<string, unknown>
): WorkflowAPI.components['schemas']['eventTrigger'] {
  return {
    type: 'event',
    event: {
      source,
      eventType,
      ...(filter && { filter }),
    },
  }
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
        language,
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
    timeout?: string
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
 * Create a connector activity (for external integrations like AAP).
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

  // WORKAROUND: Backend ExecutorType enum is missing 'connector' even though JSON schema includes it.
  // Using 'agentic' executor with structured prompt to encode connector information.
  // When backend adds 'connector' to ExecutorType, update this to use executor: 'connector' directly.
  // Reference: src/nexus/workflows/workflow_engine/models/workflow_definition.py ExecutorType enum
  const connectorPrompt = JSON.stringify({
    __type: 'connector',
    connectorId,
    operation,
    ...(parsedParameters && { parameters: parsedParameters }),
  })

  const activity: TaskActivity = {
    type: 'task',
    id,
    name,
    // Add metadata to indicate this is actually an AAP connector node
    // This allows the UI to render it with the Ansible icon/label
    metadata: {
      __executorType: 'aap',
      __connectorId: connectorId,
    },
    task: {
      executor: 'agentic',
      config: {
        agent: '__connector_workaround__', // Required field for agentic executor
        prompt: connectorPrompt,
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
