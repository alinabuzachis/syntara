import { type WorkflowAPI } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import {
  createAgenticActivity,
  createAAPJobTemplateActivity,
  createApiActivity,
  createApprovalActivity,
  createConditionActivity,
  createConnectorActivity,
  createConvergeActivity,
  createEventTrigger,
  createGenericActivity,
  createLoopActivity,
  createManualTrigger,
  createScheduledTrigger,
  createScriptActivity,
} from './workflowFactories'
import type { ActivityMetadata } from './workflowStoreTypes'

type Activity = WorkflowAPI.components['schemas']['activity']
type TaskActivity = Extract<Activity, { type: 'task' }>
type LoopActivity = Extract<Activity, { type: 'loop' }>

type ScriptTask = Extract<TaskActivity['task'], { executor: 'script' }>
type ApiTask = Extract<TaskActivity['task'], { executor: 'api' }>
type AgenticTask = Extract<TaskActivity['task'], { executor: 'agentic' }>
type ConnectorTask = Extract<TaskActivity['task'], { executor: 'connector' }>

// The AAP factory spreads its input config params directly, using different property
// names than the API schema (e.g. 'inventory' vs 'inventoryId').
interface AAPFactoryTask {
  executor: 'aap_job_template'
  config: {
    jobTemplateId: number
    inventory?: number
    credentials?: number[]
    extraVars?: Record<string, unknown>
    limit?: string
    tags?: string
    skipTags?: string
    verbosity?: number
  }
}

type ForEachLoop = Extract<LoopActivity['loop'], { type: 'forEach' }>
type WhileLoop = Extract<LoopActivity['loop'], { type: 'while' }>

type ScheduledTriggerResult = ReturnType<typeof createScheduledTrigger>
type CronSchedule = Extract<ScheduledTriggerResult['schedule'], { scheduleType: 'cron' }>
type IntervalSchedule = Extract<ScheduledTriggerResult['schedule'], { scheduleType: 'interval' }>
type ContinuousSchedule = Extract<ScheduledTriggerResult['schedule'], { scheduleType: 'continuous' }>

type GenericMetadata = {
  metadata: Pick<ActivityMetadata, '__isGeneric' | '__customMessage'>
}

describe('workflowFactories', () => {
  describe('Trigger Factories', () => {
    describe('createManualTrigger', () => {
      it('creates a manual trigger without approval', () => {
        const trigger = createManualTrigger()

        expect(trigger.type).toBe('manual')
        expect(trigger.requiresApproval).toBeUndefined()
      })

      it('creates a manual trigger with approval required', () => {
        const trigger = createManualTrigger(true)

        expect(trigger.type).toBe('manual')
        expect(trigger.requiresApproval).toBe(true)
      })

      it('creates a manual trigger with approval not required', () => {
        const trigger = createManualTrigger(false)

        expect(trigger.type).toBe('manual')
        expect(trigger.requiresApproval).toBe(false)
      })

      it('creates a manual trigger with name', () => {
        const trigger = createManualTrigger(undefined, 'My Trigger')

        expect(trigger.type).toBe('manual')
        expect(trigger.name).toBe('My Trigger')
      })
    })

    describe('createScheduledTrigger', () => {
      it('creates a cron scheduled trigger', () => {
        const trigger = createScheduledTrigger('cron', { cron: '0 9 * * *', timezone: 'UTC' })
        const schedule = trigger.schedule as CronSchedule

        expect(trigger.type).toBe('scheduled')
        expect(schedule.scheduleType).toBe('cron')
        expect(schedule.cron).toBe('0 9 * * *')
        expect(schedule.timezone).toBe('UTC')
      })

      it('creates a cron trigger without timezone', () => {
        const trigger = createScheduledTrigger('cron', { cron: '0 9 * * *' })
        const schedule = trigger.schedule as CronSchedule

        expect(schedule.scheduleType).toBe('cron')
        expect(schedule.cron).toBe('0 9 * * *')
        expect(trigger.schedule).not.toHaveProperty('timezone')
      })

      it('creates an interval scheduled trigger', () => {
        const trigger = createScheduledTrigger('interval', { interval: 'PT1H' })
        const schedule = trigger.schedule as IntervalSchedule

        expect(trigger.type).toBe('scheduled')
        expect(schedule.scheduleType).toBe('interval')
        expect(schedule.interval).toBe('PT1H')
      })

      it('creates a continuous scheduled trigger', () => {
        const trigger = createScheduledTrigger('continuous', {})
        const schedule = trigger.schedule as ContinuousSchedule

        expect(trigger.type).toBe('scheduled')
        expect(schedule.scheduleType).toBe('continuous')
        expect(schedule.continuous).toBe(true)
      })

      it('creates a scheduled trigger with name', () => {
        const trigger = createScheduledTrigger('cron', { cron: '0 9 * * *' }, 'Daily Job')

        expect(trigger.name).toBe('Daily Job')
      })

      it('falls back to continuous when cron config is missing', () => {
        const trigger = createScheduledTrigger('cron', {})

        expect(trigger.schedule.scheduleType).toBe('continuous')
      })

      it('falls back to continuous when interval config is missing', () => {
        const trigger = createScheduledTrigger('interval', {})

        expect(trigger.schedule.scheduleType).toBe('continuous')
      })
    })

    describe('createEventTrigger', () => {
      it('creates an event trigger', () => {
        const trigger = createEventTrigger('github', 'push')

        expect(trigger.type).toBe('event')
        expect(trigger.event.source).toBe('github')
        expect(trigger.event.eventType).toBe('push')
      })

      it('creates an event trigger with filter', () => {
        const trigger = createEventTrigger('github', 'push', { branch: 'main' })

        expect(trigger.event.filter).toEqual({ branch: 'main' })
      })

      it('creates an event trigger with name', () => {
        const trigger = createEventTrigger('github', 'push', undefined, 'GitHub Push')

        expect(trigger.name).toBe('GitHub Push')
      })
    })
  })

  describe('Activity Factories', () => {
    describe('createScriptActivity', () => {
      it('creates a script activity', () => {
        const activity = createScriptActivity('task-1', 'My Script', 'python', 'print("hello")')
        const task = activity.task as ScriptTask

        expect(activity.type).toBe('task')
        expect(activity.id).toBe('task-1')
        expect(activity.name).toBe('My Script')
        expect(task.executor).toBe('script')
        expect(task.config.language).toBe('python')
        expect(task.config.code).toBe('print("hello")')
      })

      it('creates a bash script activity', () => {
        const activity = createScriptActivity('task-2', 'Bash Script', 'bash', 'echo hello')
        const task = activity.task as ScriptTask

        expect(task.config.language).toBe('bash')
      })

      it('parses valid JSON inputs', () => {
        const activity = createScriptActivity('task-1', 'Script', 'python', 'code', '{"key": "value"}')

        expect(activity.task.inputs).toEqual({ key: 'value' })
      })

      it('ignores invalid JSON inputs', () => {
        const activity = createScriptActivity('task-1', 'Script', 'python', 'code', 'not valid json')

        expect(activity.task.inputs).toBeUndefined()
      })
    })

    describe('createApiActivity', () => {
      it('creates an API activity', () => {
        const activity = createApiActivity({
          id: 'api-1',
          name: 'API Call',
          method: 'GET',
          url: 'https://api.example.com',
        })
        const task = activity.task as ApiTask

        expect(activity.type).toBe('task')
        expect(activity.id).toBe('api-1')
        expect(task.executor).toBe('api')
        expect(task.config.method).toBe('GET')
        expect(task.config.url).toBe('https://api.example.com')
      })

      it('creates an API activity with headers', () => {
        const activity = createApiActivity({
          id: 'api-1',
          name: 'API Call',
          method: 'POST',
          url: 'https://api.example.com',
          headers: '{"Authorization": "Bearer token"}',
        })
        const task = activity.task as ApiTask

        expect(task.config.headers).toEqual({ Authorization: 'Bearer token' })
      })

      it('merges authentication into headers when provided', () => {
        const activity = createApiActivity({
          id: 'api-1',
          name: 'API Call',
          method: 'GET',
          url: 'https://api.example.com',
          headers: '{"Content-Type": "application/json"}',
          authentication: 'Bearer token',
        })
        const task = activity.task as ApiTask

        expect(task.config.headers).toEqual({
          'Content-Type': 'application/json',
          Authorization: 'Bearer token',
        })
      })

      it('creates an API activity with body', () => {
        const activity = createApiActivity({
          id: 'api-1',
          name: 'API Call',
          method: 'POST',
          url: 'https://api.example.com',
          body: '{"data": "value"}',
        })
        const task = activity.task as ApiTask

        expect(task.config.body).toEqual({ data: 'value' })
      })

      it('uses string body when JSON parsing fails', () => {
        const activity = createApiActivity({
          id: 'api-1',
          name: 'API Call',
          method: 'POST',
          url: 'https://api.example.com',
          body: 'plain text body',
        })
        const task = activity.task as ApiTask

        expect(task.config.body).toBe('plain text body')
      })

      it('ignores invalid JSON headers', () => {
        const activity = createApiActivity({
          id: 'api-1',
          name: 'API Call',
          method: 'GET',
          url: 'https://api.example.com',
          headers: 'invalid json',
        })
        const task = activity.task as ApiTask

        expect(task.config.headers).toBeUndefined()
      })

      it('parses valid JSON inputs', () => {
        const activity = createApiActivity({
          id: 'api-1',
          name: 'API Call',
          method: 'GET',
          url: 'https://api.example.com',
          inputs: '{"param": "value"}',
        })

        expect(activity.task.inputs).toEqual({ param: 'value' })
      })
    })

    describe('createAgenticActivity', () => {
      it('creates an agentic activity', () => {
        const activity = createAgenticActivity({ id: 'agent-1', name: 'AI Agent' })
        const task = activity.task as AgenticTask

        expect(activity.type).toBe('task')
        expect(activity.id).toBe('agent-1')
        expect(task.executor).toBe('agentic')
        expect(task.config.agent).toBe('')
      })

      it('creates an agentic activity with tools', () => {
        const activity = createAgenticActivity({
          id: 'agent-1',
          name: 'AI Agent',
          tools: ['tool1', 'tool2'],
        })
        const task = activity.task as AgenticTask

        expect(task.config.tools).toEqual(['tool1', 'tool2'])
      })

      it('creates an agentic activity with prompt', () => {
        const activity = createAgenticActivity({
          id: 'agent-1',
          name: 'AI Agent',
          prompt: 'Do something',
        })
        const task = activity.task as AgenticTask

        expect(task.config.prompt).toBe('Do something')
      })

      it('creates an agentic activity with model', () => {
        const activity = createAgenticActivity({
          id: 'agent-1',
          name: 'AI Agent',
          model: 'gpt-4',
        })
        const task = activity.task as AgenticTask

        expect(task.config.model).toBe('gpt-4')
      })

      it('creates an agentic activity with fileIds', () => {
        const activity = createAgenticActivity({
          id: 'agent-1',
          name: 'AI Agent',
          fileIds: ['file-1', 'file-2'],
        })
        const task = activity.task as AgenticTask

        expect(task.config.fileIds).toEqual(['file-1', 'file-2'])
      })

      it('does not include empty tools array', () => {
        const activity = createAgenticActivity({ id: 'agent-1', name: 'AI Agent', tools: [] })
        const task = activity.task as AgenticTask

        expect(task.config.tools).toBeUndefined()
      })

      it('parses valid JSON inputs', () => {
        const activity = createAgenticActivity({
          id: 'agent-1',
          name: 'AI Agent',
          inputs: '{"key": "val"}',
        })

        expect(activity.task.inputs).toEqual({ key: 'val' })
      })
    })

    describe('createConditionActivity', () => {
      it('creates a condition activity', () => {
        const activity = createConditionActivity('cond-1', 'Check Status', 'status === "active"')

        expect(activity.type).toBe('condition')
        expect(activity.id).toBe('cond-1')
        expect(activity.name).toBe('Check Status')
        expect(activity.condition).toBe('status === "active"')
        expect(activity.then).toEqual([])
        expect(activity.else).toEqual([])
      })
    })

    describe('createLoopActivity', () => {
      it('creates a forEach loop activity', () => {
        const activity = createLoopActivity('loop-1', 'Process Items', 'forEach', {
          items: '{{ items }}',
          itemVariable: 'item',
          indexVariable: 'idx',
        })
        const loop = activity.loop as ForEachLoop

        expect(activity.type).toBe('loop')
        expect(activity.id).toBe('loop-1')
        expect(loop.type).toBe('forEach')
        expect(loop.items).toBe('{{ items }}')
        expect(loop.itemVariable).toBe('item')
        expect(loop.indexVariable).toBe('idx')
      })

      it('creates a while loop activity', () => {
        const activity = createLoopActivity('loop-1', 'While Loop', 'while', {
          condition: 'count < 10',
          maxIterations: 100,
        })
        const loop = activity.loop as WhileLoop

        expect(loop.type).toBe('while')
        expect(loop.condition).toBe('count < 10')
        expect(loop.maxIterations).toBe(100)
      })

      it('does not include invalid maxIterations', () => {
        const activity = createLoopActivity('loop-1', 'While Loop', 'while', {
          condition: 'count < 10',
          maxIterations: Number.NaN,
        })

        expect(activity.loop).not.toHaveProperty('maxIterations')
      })

      it('falls back to forEach with empty items when config is missing', () => {
        const activity = createLoopActivity('loop-1', 'Loop', 'forEach', {})
        const loop = activity.loop as ForEachLoop

        expect(loop.type).toBe('forEach')
        expect(loop.items).toBe('')
      })

      it('falls back when while has no condition', () => {
        const activity = createLoopActivity('loop-1', 'Loop', 'while', {})

        expect(activity.loop.type).toBe('forEach')
      })
    })

    describe('createConvergeActivity', () => {
      it('creates a converge activity', () => {
        const activity = createConvergeActivity('conv-1', 'Wait for All')

        expect(activity.type).toBe('converge')
        expect(activity.id).toBe('conv-1')
        expect(activity.name).toBe('Wait for All')
        expect(activity.converge.branches).toEqual([])
        expect(activity.converge.strategy).toBe('all')
      })

      it('creates a converge activity with config', () => {
        const activity = createConvergeActivity('conv-1', 'Converge', {
          timeout: 3600,
          onTimeout: 'fail',
          aggregateOutputs: true,
        })

        expect(activity.converge.timeout).toBe(3600)
        expect(activity.converge.onTimeout).toBe('fail')
        expect(activity.converge.aggregateOutputs).toBe(true)
        expect(activity.converge.strategy).toBe('all')
      })

      it('creates a converge activity with strategy', () => {
        const activity = createConvergeActivity('conv-1', 'Converge', {
          strategy: 'any',
          timeout: 600,
        })

        expect(activity.converge.strategy).toBe('any')
        expect(activity.converge.timeout).toBe(600)
      })

      it('creates a converge activity with strategy any and optional fields', () => {
        const activity = createConvergeActivity('conv-1', 'Converge Any', {
          strategy: 'any',
          requiredPathCount: 2,
          remainingBehavior: 'cancel',
        })

        expect(activity.converge.strategy).toBe('any')
        expect((activity.converge as { requiredPathCount?: number }).requiredPathCount).toBe(2)
        expect((activity.converge as { remainingBehavior?: string }).remainingBehavior).toBe('cancel')
      })
    })

    describe('createAAPJobTemplateActivity', () => {
      it('creates an AAP job template activity', () => {
        const activity = createAAPJobTemplateActivity('aap-1', 'Run Playbook', 123)
        const task = activity.task as AAPFactoryTask

        expect(activity.type).toBe('task')
        expect(activity.id).toBe('aap-1')
        expect(task.executor).toBe('aap_job_template')
        expect(task.config.jobTemplateId).toBe(123)
      })

      it('creates an AAP activity with full config', () => {
        const activity = createAAPJobTemplateActivity('aap-1', 'Run Playbook', 123, {
          inventory: 456,
          credentials: [789],
          extraVars: { env: 'prod' },
          limit: 'web-servers',
          tags: 'deploy',
          skipTags: 'test',
          verbosity: 2,
        })
        const task = activity.task as AAPFactoryTask

        expect(task.config.inventory).toBe(456)
        expect(task.config.credentials).toEqual([789])
        expect(task.config.extraVars).toEqual({ env: 'prod' })
        expect(task.config.limit).toBe('web-servers')
        expect(task.config.tags).toBe('deploy')
        expect(task.config.skipTags).toBe('test')
        expect(task.config.verbosity).toBe(2)
      })
    })

    describe('createConnectorActivity', () => {
      it('creates a connector activity', () => {
        const activity = createConnectorActivity('conn-1', 'Slack Message', 'slack', 'send_message')
        const task = activity.task as ConnectorTask

        expect(activity.type).toBe('task')
        expect(activity.id).toBe('conn-1')
        expect(task.executor).toBe('connector')
        expect(task.config.connectorId).toBe('slack')
        expect(task.config.operation).toBe('send_message')
      })

      it('creates a connector activity with parameters', () => {
        const activity = createConnectorActivity(
          'conn-1',
          'Slack Message',
          'slack',
          'send_message',
          '{"channel": "#general"}'
        )
        const task = activity.task as ConnectorTask

        expect(task.config.parameters).toEqual({ channel: '#general' })
      })

      it('ignores invalid JSON parameters', () => {
        const activity = createConnectorActivity('conn-1', 'Slack Message', 'slack', 'send_message', 'invalid')
        const task = activity.task as ConnectorTask

        expect(task.config.parameters).toBeUndefined()
      })
    })

    describe('createGenericActivity', () => {
      it('creates a generic placeholder activity', () => {
        const activity = createGenericActivity('gen-1')
        const withMetadata = activity as TaskActivity & GenericMetadata

        expect(activity.type).toBe('task')
        expect(activity.id).toBe('gen-1')
        expect(activity.name).toBe('New Node')
        expect(withMetadata.metadata.__isGeneric).toBe(true)
      })

      it('creates a generic activity with custom name', () => {
        const activity = createGenericActivity('gen-1', 'Custom Name')

        expect(activity.name).toBe('Custom Name')
      })

      it('creates a generic activity with custom message', () => {
        const activity = createGenericActivity('gen-1', 'Node', 'Select a node type')
        const withMetadata = activity as TaskActivity & GenericMetadata

        expect(withMetadata.metadata.__customMessage).toBe('Select a node type')
      })
    })

    describe('createApprovalActivity', () => {
      it('creates an approval activity', () => {
        const activity = createApprovalActivity({
          id: 'appr-1',
          name: 'Approval Gate',
          approvers: ['admin@example.com'],
          prompt: 'Please approve',
        })

        expect(activity.type).toBe('approval')
        expect(activity.id).toBe('appr-1')
        expect(activity.name).toBe('Approval Gate')
        expect(activity.onApproved).toEqual([])
        expect(activity.onRejected).toEqual([])
        expect(activity.approval?.approvers).toEqual(['admin@example.com'])
        expect(activity.approval?.prompt).toBe('Please approve')
      })

      it('creates an approval activity with timeout', () => {
        const activity = createApprovalActivity({
          id: 'appr-1',
          name: 'Approval',
          approvers: ['admin@example.com'],
          prompt: 'Approve?',
          timeout: 3600,
        })

        expect(activity.approval?.timeout).toBe(3600)
      })

      it('creates an approval activity with onTimeout action', () => {
        const activity = createApprovalActivity({
          id: 'appr-1',
          name: 'Approval',
          approvers: ['admin@example.com'],
          prompt: 'Approve?',
          timeout: 3600,
          onTimeout: 'reject',
        })

        expect(activity.approval?.onTimeout).toBe('reject')
      })
    })
  })
})
