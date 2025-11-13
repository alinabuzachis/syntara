import { describe, expect, it } from 'vitest'
import { useWorkflowStore } from '../../stores/useWorkflowStore'

// Test the workflow store helpers used by Builder
describe('Builder Workflow Store Helpers', () => {
  describe('createManualTrigger', () => {
    it('creates manual trigger without approval', async () => {
      const { createManualTrigger } = await import('../../stores/useWorkflowStore')
      const trigger = createManualTrigger()

      expect(trigger.type).toBe('manual')
      expect(trigger.requiresApproval).toBeUndefined()
    })

    it('creates manual trigger with approval required', async () => {
      const { createManualTrigger } = await import('../../stores/useWorkflowStore')
      const trigger = createManualTrigger(true)

      expect(trigger.type).toBe('manual')
      expect(trigger.requiresApproval).toBe(true)
    })
  })

  describe('createScheduledTrigger', () => {
    it('creates cron-based scheduled trigger', async () => {
      const { createScheduledTrigger } = await import('../../stores/useWorkflowStore')
      const trigger = createScheduledTrigger('cron', {
        cron: '0 0 * * *',
        timezone: 'UTC',
      })

      expect(trigger.type).toBe('scheduled')
      expect(trigger.schedule.scheduleType).toBe('cron')
      expect(trigger.schedule.cron).toBe('0 0 * * *')
      expect(trigger.schedule.timezone).toBe('UTC')
    })

    it('creates interval-based scheduled trigger', async () => {
      const { createScheduledTrigger } = await import('../../stores/useWorkflowStore')
      const trigger = createScheduledTrigger('interval', {
        interval: 'PT1H',
      })

      expect(trigger.type).toBe('scheduled')
      expect(trigger.schedule.scheduleType).toBe('interval')
      expect(trigger.schedule.interval).toBe('PT1H')
    })

    it('creates continuous scheduled trigger', async () => {
      const { createScheduledTrigger } = await import('../../stores/useWorkflowStore')
      const trigger = createScheduledTrigger('continuous', {})

      expect(trigger.type).toBe('scheduled')
      expect(trigger.schedule.scheduleType).toBe('continuous')
    })
  })

  describe('createEventTrigger', () => {
    it('creates event trigger without filter', async () => {
      const { createEventTrigger } = await import('../../stores/useWorkflowStore')
      const trigger = createEventTrigger('github', 'push')

      expect(trigger.type).toBe('event')
      expect(trigger.event.source).toBe('github')
      expect(trigger.event.eventType).toBe('push')
      expect(trigger.event.filter).toBeUndefined()
    })

    it('creates event trigger with filter', async () => {
      const { createEventTrigger } = await import('../../stores/useWorkflowStore')
      const trigger = createEventTrigger('github', 'push', { branch: 'main' })

      expect(trigger.type).toBe('event')
      expect(trigger.event.source).toBe('github')
      expect(trigger.event.eventType).toBe('push')
      expect(trigger.event.filter).toEqual({ branch: 'main' })
    })
  })

  describe('createScriptActivity', () => {
    it('creates python script activity', async () => {
      const { createScriptActivity } = await import('../../stores/useWorkflowStore')
      const activity = createScriptActivity('task-1', 'My Script', 'python', 'print("Hello")')

      expect(activity.type).toBe('task')
      expect(activity.id).toBe('task-1')
      expect(activity.name).toBe('My Script')
      expect(activity.task.executor).toBe('script')
      expect(activity.task.config.language).toBe('python')
      expect(activity.task.config.code).toBe('print("Hello")')
    })

    it('creates javascript script activity', async () => {
      const { createScriptActivity } = await import('../../stores/useWorkflowStore')
      const activity = createScriptActivity('task-2', 'JS Script', 'javascript', 'console.log("Hi")')

      expect(activity.task.config.language).toBe('javascript')
      expect(activity.task.config.code).toBe('console.log("Hi")')
    })
  })

  describe('createApiActivity', () => {
    it('creates API activity without headers or body', async () => {
      const { createApiActivity } = await import('../../stores/useWorkflowStore')
      const activity = createApiActivity('api-1', 'GET Users', 'GET', 'https://api.example.com/users')

      expect(activity.type).toBe('task')
      expect(activity.id).toBe('api-1')
      expect(activity.name).toBe('GET Users')
      expect(activity.task.executor).toBe('api')
      expect(activity.task.config.method).toBe('GET')
      expect(activity.task.config.url).toBe('https://api.example.com/users')
      expect(activity.task.config.headers).toBeUndefined()
      expect(activity.task.config.body).toBeUndefined()
    })

    it('creates API activity with valid JSON headers', async () => {
      const { createApiActivity } = await import('../../stores/useWorkflowStore')
      const headers = JSON.stringify({ 'Content-Type': 'application/json' })
      const activity = createApiActivity('api-2', 'POST Data', 'POST', 'https://api.example.com/data', headers)

      expect(activity.task.config.headers).toEqual({ 'Content-Type': 'application/json' })
    })

    it('creates API activity with valid JSON body', async () => {
      const { createApiActivity } = await import('../../stores/useWorkflowStore')
      const body = JSON.stringify({ name: 'Test' })
      const activity = createApiActivity('api-3', 'POST User', 'POST', 'https://api.example.com/users', undefined, body)

      expect(activity.task.config.body).toEqual({ name: 'Test' })
    })

    it('handles invalid JSON headers gracefully', async () => {
      const { createApiActivity } = await import('../../stores/useWorkflowStore')
      const activity = createApiActivity('api-4', 'POST Data', 'POST', 'https://api.example.com/data', 'invalid-json')

      expect(activity.task.config.headers).toBeUndefined()
    })

    it('uses string body when JSON parsing fails', async () => {
      const { createApiActivity } = await import('../../stores/useWorkflowStore')
      const activity = createApiActivity(
        'api-5',
        'POST Text',
        'POST',
        'https://api.example.com/text',
        undefined,
        'plain text'
      )

      expect(activity.task.config.body).toBe('plain text')
    })
  })

  describe('useWorkflowStore', () => {
    it('initializes with null workflow', () => {
      const state = useWorkflowStore.getState()
      expect(state.currentWorkflow).toBeNull()
    })

    it('sets workflow', () => {
      const store = useWorkflowStore
      const mockWorkflow = {
        schemaVersion: '1.0.0',
        version: 1,
        metadata: { name: 'Test', description: 'Test' },
        workflow: { activities: [] },
      }

      store.getState().setWorkflow(mockWorkflow)
      expect(store.getState().currentWorkflow).toEqual(mockWorkflow)

      // Cleanup
      store.getState().setWorkflow(null)
    })

    it('adds trigger to workflow', async () => {
      const store = useWorkflowStore
      const { createManualTrigger } = await import('../../stores/useWorkflowStore')

      store.getState().setWorkflow({
        schemaVersion: '1.0.0',
        version: 1,
        metadata: { name: 'Test', description: 'Test' },
        workflow: { activities: [] },
      })

      const trigger = createManualTrigger()
      store.getState().addTrigger(trigger)

      expect(store.getState().currentWorkflow?.triggers).toHaveLength(1)
      expect(store.getState().currentWorkflow?.triggers?.[0]).toEqual(trigger)

      // Cleanup
      store.getState().setWorkflow(null)
    })

    it('removes trigger from workflow', async () => {
      const store = useWorkflowStore
      const { createManualTrigger } = await import('../../stores/useWorkflowStore')

      store.getState().setWorkflow({
        schemaVersion: '1.0.0',
        version: 1,
        metadata: { name: 'Test', description: 'Test' },
        triggers: [createManualTrigger(), createManualTrigger()],
        workflow: { activities: [] },
      })

      store.getState().removeTrigger(0)

      expect(store.getState().currentWorkflow?.triggers).toHaveLength(1)

      // Cleanup
      store.getState().setWorkflow(null)
    })

    it('adds activity to workflow', async () => {
      const store = useWorkflowStore
      const { createScriptActivity } = await import('../../stores/useWorkflowStore')

      store.getState().setWorkflow({
        schemaVersion: '1.0.0',
        version: 1,
        metadata: { name: 'Test', description: 'Test' },
        workflow: { activities: [] },
      })

      const activity = createScriptActivity('task-1', 'Test Task', 'python', 'print("test")')
      store.getState().addActivity(activity)

      expect(store.getState().currentWorkflow?.workflow.activities).toHaveLength(1)
      expect(store.getState().currentWorkflow?.workflow.activities[0]).toEqual(activity)

      // Cleanup
      store.getState().setWorkflow(null)
    })

    it('removes activity from workflow', async () => {
      const store = useWorkflowStore
      const { createScriptActivity } = await import('../../stores/useWorkflowStore')

      const activity1 = createScriptActivity('task-1', 'Task 1', 'python', 'print("1")')
      const activity2 = createScriptActivity('task-2', 'Task 2', 'python', 'print("2")')

      store.getState().setWorkflow({
        schemaVersion: '1.0.0',
        version: 1,
        metadata: { name: 'Test', description: 'Test' },
        workflow: { activities: [activity1, activity2] },
      })

      store.getState().removeActivity('task-1')

      expect(store.getState().currentWorkflow?.workflow.activities).toHaveLength(1)
      expect(store.getState().currentWorkflow?.workflow.activities[0].id).toBe('task-2')

      // Cleanup
      store.getState().setWorkflow(null)
    })

    it('updates activity in workflow', async () => {
      const store = useWorkflowStore
      const { createScriptActivity } = await import('../../stores/useWorkflowStore')

      const activity = createScriptActivity('task-1', 'Original Name', 'python', 'print("test")')

      store.getState().setWorkflow({
        schemaVersion: '1.0.0',
        version: 1,
        metadata: { name: 'Test', description: 'Test' },
        workflow: { activities: [activity] },
      })

      store.getState().updateActivity('task-1', { name: 'Updated Name' })

      expect(store.getState().currentWorkflow?.workflow.activities[0].name).toBe('Updated Name')

      // Cleanup
      store.getState().setWorkflow(null)
    })
  })
})
