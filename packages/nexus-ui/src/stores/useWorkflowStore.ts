import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { create } from 'zustand'

// Type aliases from API contracts
type WorkflowDefinition = WorkflowAPI.components['schemas']['workflow-definition.schema']
type Trigger =
  | WorkflowAPI.components['schemas']['manualTrigger']
  | WorkflowAPI.components['schemas']['scheduledTrigger']
  | WorkflowAPI.components['schemas']['eventTrigger']
type Activity = WorkflowAPI.components['schemas']['activity']
type TaskActivity = Extract<Activity, { type: 'task' }>

interface EdgeConnection {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

interface WorkflowStore {
  currentWorkflow: WorkflowDefinition | null
  workflowVersion: number // Incremented only when setWorkflow is called
  edges: EdgeConnection[]
  setWorkflow: (workflow: WorkflowDefinition | null) => void
  setEdges: (edges: EdgeConnection[]) => void
  addTrigger: (trigger: Trigger) => void
  removeTrigger: (index: number) => void
  updateTrigger: (index: number, trigger: Trigger) => void
  addActivity: (activity: Activity) => void
  removeActivity: (activityId: string) => void
  updateActivity: (activityId: string, updates: Partial<Activity>) => void
}

export const useWorkflowStore = create<WorkflowStore>((set) => ({
  currentWorkflow: null,
  workflowVersion: 0,
  edges: [],

  setWorkflow: (workflow) => {
    set((state) => ({
      currentWorkflow: workflow,
      workflowVersion: state.workflowVersion + 1,
    }))
  },

  setEdges: (edges) => {
    set({ edges })
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

  updateTrigger: (index, trigger) => {
    set((state) => {
      if (!state.currentWorkflow?.triggers) return state

      const triggers = [...state.currentWorkflow.triggers]
      triggers[index] = trigger
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

      // Helper function to recursively remove activity and clean up parent structures
      const removeFromActivities = (activities: Activity[]): Activity[] => {
        const filtered: Activity[] = []

        for (const activity of activities) {
          // Skip the activity we're removing
          if (activity.id === activityId) {
            continue
          }

          // For other activities, recursively check nested structures
          if (activity.type === 'parallel') {
            const updatedBranches = activity.branches
              ?.map((branch) => removeFromActivities([branch])[0])
              .filter((branch): branch is Activity => branch !== undefined)

            // If parallel has less than 2 branches, it's invalid - skip it
            if (!updatedBranches || updatedBranches.length < 2) {
              // If only one branch remains, promote it to replace the parallel activity
              if (updatedBranches?.length === 1) {
                filtered.push(updatedBranches[0])
              }
              continue
            }

            filtered.push({
              ...activity,
              branches: updatedBranches,
            })
          } else if (activity.type === 'sequence') {
            const updatedSteps = activity.steps ? removeFromActivities(activity.steps) : []

            // If sequence has no steps, skip it
            if (updatedSteps.length === 0) {
              continue
            }

            // If sequence has only one step, promote it
            if (updatedSteps.length === 1) {
              filtered.push(updatedSteps[0])
              continue
            }

            filtered.push({
              ...activity,
              steps: updatedSteps,
            })
          } else if (activity.type === 'condition') {
            const updatedThen = activity.then ? removeFromActivities(activity.then) : []
            const updatedElse = activity.else ? removeFromActivities(activity.else) : undefined

            filtered.push({
              ...activity,
              then: updatedThen,
              else: updatedElse,
            })
          } else if (activity.type === 'loop') {
            const updatedDo = activity.loop.do ? removeFromActivities(activity.loop.do) : []

            // If loop has no body, skip it
            if (updatedDo.length === 0) {
              continue
            }

            filtered.push({
              ...activity,
              loop: {
                ...activity.loop,
                do: updatedDo,
              },
            })
          } else if (activity.type === 'join') {
            // For join activities, we need to check if any source activities were removed
            // This is handled by the structure - if sources are removed, edges will be gone
            // The join activity itself stays, but may become unreachable
            filtered.push(activity)
          } else {
            // For task and other activities, just keep them
            filtered.push(activity)
          }
        }

        return filtered
      }

      return {
        currentWorkflow: {
          ...state.currentWorkflow,
          workflow: {
            ...state.currentWorkflow.workflow,
            activities: removeFromActivities(state.currentWorkflow.workflow.activities),
          },
        },
      }
    })
  },

  updateActivity: (activityId, updates) => {
    set((state) => {
      if (!state.currentWorkflow) return state

      // Helper function to recursively update activity in nested structures
      const updateInActivities = (activities: Activity[]): Activity[] => {
        return activities.map((activity) => {
          // If this is the activity we're looking for, update it
          if (activity.id === activityId) {
            return { ...activity, ...updates } as Activity
          }

          // Otherwise, recursively search nested structures
          if (activity.type === 'parallel') {
            return {
              ...activity,
              branches: activity.branches ? updateInActivities(activity.branches) : activity.branches,
            }
          } else if (activity.type === 'sequence') {
            return {
              ...activity,
              steps: activity.steps ? updateInActivities(activity.steps) : activity.steps,
            }
          } else if (activity.type === 'condition') {
            return {
              ...activity,
              then: activity.then ? updateInActivities(activity.then) : activity.then,
              else: activity.else ? updateInActivities(activity.else) : activity.else,
            }
          } else if (activity.type === 'loop') {
            return {
              ...activity,
              loop: {
                ...activity.loop,
                do: activity.loop.do ? updateInActivities(activity.loop.do) : activity.loop.do,
              },
            }
          }

          return activity
        })
      }

      return {
        currentWorkflow: {
          ...state.currentWorkflow,
          workflow: {
            ...state.currentWorkflow.workflow,
            activities: updateInActivities(state.currentWorkflow.workflow.activities),
          },
        },
      }
    })
  },
}))

// Helper functions to create triggers (return plain objects)
export function createManualTrigger(requiresApproval?: boolean): WorkflowAPI.components['schemas']['manualTrigger'] {
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

// Helper functions to create task activities
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
