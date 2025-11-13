import { create } from 'zustand'
import type { WorkflowAPI } from '@ansible/nexus-contracts'

// Type aliases from API contracts
type WorkflowDefinition = WorkflowAPI['components']['schemas']['workflow-definition.schema']
type Trigger =
  | WorkflowAPI['components']['schemas']['manualTrigger']
  | WorkflowAPI['components']['schemas']['scheduledTrigger']
  | WorkflowAPI['components']['schemas']['eventTrigger']
type Activity = WorkflowAPI['components']['schemas']['activity']
type TaskActivity = Extract<Activity, { type: 'task' }>

interface WorkflowStore {
  currentWorkflow: WorkflowDefinition | null
  workflowVersion: number // Incremented only when setWorkflow is called
  setWorkflow: (workflow: WorkflowDefinition | null) => void
  addTrigger: (trigger: Trigger) => void
  removeTrigger: (index: number) => void
  addActivity: (activity: Activity) => void
  removeActivity: (activityId: string) => void
  updateActivity: (activityId: string, updates: Partial<Activity>) => void
}

export const useWorkflowStore = create<WorkflowStore>((set) => ({
  currentWorkflow: null,
  workflowVersion: 0,

  setWorkflow: (workflow) => {
    set((state) => ({
      currentWorkflow: workflow,
      workflowVersion: state.workflowVersion + 1,
    }))
  },

  addTrigger: (trigger) => {
    set((state) => {
      if (!state.currentWorkflow) return state

      const triggers = state.currentWorkflow.triggers || []
      return {
        currentWorkflow: {
          ...state.currentWorkflow,
          triggers: [...triggers, trigger],
        },
      }
    })
  },

  removeTrigger: (index) => {
    set((state) => {
      if (!state.currentWorkflow?.triggers) return state

      const triggers = [...state.currentWorkflow.triggers]
      triggers.splice(index, 1)
      return {
        currentWorkflow: {
          ...state.currentWorkflow,
          triggers,
        },
      }
    })
  },

  addActivity: (activity) => {
    set((state) => {
      if (!state.currentWorkflow) return state

      return {
        currentWorkflow: {
          ...state.currentWorkflow,
          workflow: {
            ...state.currentWorkflow.workflow,
            activities: [...state.currentWorkflow.workflow.activities, activity],
          },
        },
      }
    })
  },

  removeActivity: (activityId) => {
    set((state) => {
      if (!state.currentWorkflow) return state

      return {
        currentWorkflow: {
          ...state.currentWorkflow,
          workflow: {
            ...state.currentWorkflow.workflow,
            activities: state.currentWorkflow.workflow.activities.filter((a) => a.id !== activityId),
          },
        },
      }
    })
  },

  updateActivity: (activityId, updates) => {
    set((state) => {
      if (!state.currentWorkflow) return state

      return {
        currentWorkflow: {
          ...state.currentWorkflow,
          workflow: {
            ...state.currentWorkflow.workflow,
            activities: state.currentWorkflow.workflow.activities.map((a) =>
              a.id === activityId ? { ...a, ...updates } : a
            ),
          },
        },
      }
    })
  },
}))

// Helper functions to create triggers (return plain objects)
export function createManualTrigger(requiresApproval?: boolean): WorkflowAPI['components']['schemas']['manualTrigger'] {
  return {
    type: 'manual',
    ...(requiresApproval !== undefined && { requiresApproval }),
  }
}

export function createScheduledTrigger(
  scheduleType: 'cron' | 'interval' | 'continuous',
  config: {
    cron?: string
    timezone?: string
    interval?: string
  }
): WorkflowAPI['components']['schemas']['scheduledTrigger'] {
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
      },
    }
  }
}

export function createEventTrigger(
  source: string,
  eventType: string,
  filter?: Record<string, unknown>
): WorkflowAPI['components']['schemas']['eventTrigger'] {
  return {
    type: 'event',
    event: {
      source,
      eventType,
      ...(filter && { filter }),
    },
  }
}

// Helper functions to create task activities
export function createScriptActivity(
  id: string,
  name: string,
  language: 'python' | 'javascript' | 'bash' | 'powershell',
  code: string
): TaskActivity {
  return {
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
}

export function createApiActivity(
  id: string,
  name: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  headers?: string,
  body?: string
): TaskActivity {
  const activity: TaskActivity = {
    type: 'task',
    id,
    name,
    task: {
      executor: 'api',
      config: {
        method,
        url,
      },
    },
  }

  if (headers) {
    try {
      activity.task.config.headers = JSON.parse(headers)
    } catch {
      // If headers is not valid JSON, skip it
    }
  }

  if (body) {
    try {
      activity.task.config.body = JSON.parse(body)
    } catch {
      // If body is not valid JSON, use as string
      activity.task.config.body = body
    }
  }

  return activity
}
