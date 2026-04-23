import { describe, expect, it } from 'vitest'

import {
  createAgenticActivity,
  createAAPJobTemplateActivity,
  createApiActivity,
  createApprovalActivity,
  createConditionActivity,
  createConvergeActivity,
  createEventTrigger,
  createGenericActivity,
  createLoopActivity,
  createManualTrigger,
  createScheduledTrigger,
  createScriptActivity,
} from './workflowFactories'

describe('workflowFactories', () => {
  describe('Trigger Factories', () => {
    describe('createManualTrigger', () => {
      it('creates a manual trigger without approval', () => {
        const trigger = createManualTrigger('trigger-1')

        expect(trigger.id).toBe('trigger-1')
        expect(trigger.type).toBe('manual_trigger')
        expect(trigger.config).toEqual({})
      })

      it('creates a manual trigger with approval param (ignored in v2)', () => {
        const trigger = createManualTrigger('trigger-2', true)

        expect(trigger.id).toBe('trigger-2')
        expect(trigger.type).toBe('manual_trigger')
      })

      it('creates a manual trigger with approval false (ignored in v2)', () => {
        const trigger = createManualTrigger('trigger-3', false)

        expect(trigger.id).toBe('trigger-3')
        expect(trigger.type).toBe('manual_trigger')
      })

      it('creates a manual trigger with name', () => {
        const trigger = createManualTrigger('trigger-4', undefined, 'My Trigger')

        expect(trigger.id).toBe('trigger-4')
        expect(trigger.type).toBe('manual_trigger')
        expect(trigger.name).toBe('My Trigger')
      })
    })

    describe('createScheduledTrigger', () => {
      it('creates a cron scheduled trigger', () => {
        const trigger = createScheduledTrigger('trigger-5', 'cron', { cron: '0 9 * * *', timezone: 'UTC' })

        expect(trigger.id).toBe('trigger-5')
        expect(trigger.type).toBe('scheduled')
        expect(trigger.config.schedule_type).toBe('cron')
        expect(trigger.config.cron).toBe('0 9 * * *')
        expect(trigger.config.timezone).toBe('UTC')
      })

      it('creates a cron trigger without timezone', () => {
        const trigger = createScheduledTrigger('trigger-6', 'cron', { cron: '0 9 * * *' })

        expect(trigger.id).toBe('trigger-6')
        expect(trigger.config.schedule_type).toBe('cron')
        expect(trigger.config.cron).toBe('0 9 * * *')
        expect(trigger.config).not.toHaveProperty('timezone')
      })

      it('creates an interval scheduled trigger', () => {
        const trigger = createScheduledTrigger('trigger-7', 'interval', { interval: 'PT1H' })

        expect(trigger.id).toBe('trigger-7')
        expect(trigger.type).toBe('scheduled')
        expect(trigger.config.schedule_type).toBe('interval')
        expect(trigger.config.interval).toBe('PT1H')
      })

      it('creates a continuous scheduled trigger', () => {
        const trigger = createScheduledTrigger('trigger-8', 'continuous', {})

        expect(trigger.id).toBe('trigger-8')
        expect(trigger.type).toBe('scheduled')
        expect(trigger.config.schedule_type).toBe('continuous')
      })

      it('creates a scheduled trigger with name', () => {
        const trigger = createScheduledTrigger('trigger-9', 'cron', { cron: '0 9 * * *' }, 'Daily Job')

        expect(trigger.id).toBe('trigger-9')
        expect(trigger.name).toBe('Daily Job')
      })

      it('falls back to continuous when cron config is missing', () => {
        const trigger = createScheduledTrigger('trigger-10', 'cron', {})

        expect(trigger.id).toBe('trigger-10')
        expect(trigger.config.schedule_type).toBe('cron')
      })

      it('falls back to continuous when interval config is missing', () => {
        const trigger = createScheduledTrigger('trigger-11', 'interval', {})

        expect(trigger.id).toBe('trigger-11')
        expect(trigger.config.schedule_type).toBe('interval')
      })
    })

    describe('createEventTrigger', () => {
      it('creates an event trigger', () => {
        const trigger = createEventTrigger('trigger-12', 'github', 'push')

        expect(trigger.id).toBe('trigger-12')
        expect(trigger.type).toBe('event')
        expect(trigger.config.source).toBe('github')
        expect(trigger.config.event_type).toBe('push')
      })

      it('creates an event trigger with filter', () => {
        const trigger = createEventTrigger('trigger-13', 'github', 'push', { branch: 'main' })

        expect(trigger.id).toBe('trigger-13')
        expect(trigger.config.filter).toEqual({ branch: 'main' })
      })

      it('creates an event trigger with name', () => {
        const trigger = createEventTrigger('trigger-14', 'github', 'push', undefined, 'GitHub Push')

        expect(trigger.id).toBe('trigger-14')
        expect(trigger.name).toBe('GitHub Push')
      })
    })
  })

  describe('Activity Factories', () => {
    describe('createScriptActivity', () => {
      it('creates a script activity', () => {
        const activity = createScriptActivity('task-1', 'My Script', 'python', 'print("hello")')

        expect(activity.type).toBe('script')
        expect(activity.id).toBe('task-1')
        expect(activity.name).toBe('My Script')
        expect(activity.config.language).toBe('python')
        expect(activity.config.code).toBe('print("hello")')
      })

      it('creates a bash script activity', () => {
        const activity = createScriptActivity('task-2', 'Bash Script', 'bash', 'echo hello')

        expect(activity.config.language).toBe('bash')
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

        expect(activity.type).toBe('http_request')
        expect(activity.id).toBe('api-1')
        expect(activity.config.method).toBe('GET')
        expect(activity.config.url).toBe('https://api.example.com')
      })

      it('creates an API activity with headers', () => {
        const activity = createApiActivity({
          id: 'api-1',
          name: 'API Call',
          method: 'POST',
          url: 'https://api.example.com',
          headers: '{"Authorization": "Bearer token"}',
        })

        expect(activity.config.headers).toEqual({ Authorization: 'Bearer token' })
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

        expect(activity.config.headers).toEqual({
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

        expect(activity.config.body).toEqual({ data: 'value' })
      })

      it('uses string body when JSON parsing fails', () => {
        const activity = createApiActivity({
          id: 'api-1',
          name: 'API Call',
          method: 'POST',
          url: 'https://api.example.com',
          body: 'plain text body',
        })

        expect(activity.config.body).toBe('plain text body')
      })

      it('ignores invalid JSON headers', () => {
        const activity = createApiActivity({
          id: 'api-1',
          name: 'API Call',
          method: 'GET',
          url: 'https://api.example.com',
          headers: 'invalid json',
        })

        expect(activity.config.headers).toBeUndefined()
      })

      it('does not include inputs in v2', () => {
        const activity = createApiActivity({
          id: 'api-1',
          name: 'API Call',
          method: 'GET',
          url: 'https://api.example.com',
          inputs: '{"param": "value"}',
        })

        expect(activity.config).not.toHaveProperty('inputs')
      })
    })

    describe('createAgenticActivity', () => {
      it('creates an agentic activity', () => {
        const activity = createAgenticActivity({ id: 'agent-1', name: 'AI Agent' })

        expect(activity.type).toBe('agentic')
        expect(activity.id).toBe('agent-1')
        expect(activity.config).toEqual({})
      })

      it('creates an agentic activity with tools', () => {
        const activity = createAgenticActivity({
          id: 'agent-1',
          name: 'AI Agent',
          tools: ['tool1', 'tool2'],
        })

        expect(activity.config.tool_selections).toEqual(['tool1', 'tool2'])
      })

      it('creates an agentic activity with prompt', () => {
        const activity = createAgenticActivity({
          id: 'agent-1',
          name: 'AI Agent',
          prompt: 'Do something',
        })

        expect(activity.config.prompt).toBe('Do something')
      })

      it('creates an agentic activity with model', () => {
        const activity = createAgenticActivity({
          id: 'agent-1',
          name: 'AI Agent',
          model: 'gpt-4',
        })

        expect(activity.config.model).toBe('gpt-4')
      })

      it('creates an agentic activity with fileIds', () => {
        const activity = createAgenticActivity({
          id: 'agent-1',
          name: 'AI Agent',
          fileIds: ['file-1', 'file-2'],
        })

        expect(activity.config.file_ids).toEqual(['file-1', 'file-2'])
      })

      it('does not include empty tools array', () => {
        const activity = createAgenticActivity({ id: 'agent-1', name: 'AI Agent', tools: [] })

        expect(activity.config.tool_selections).toBeUndefined()
      })

      it('does not include inputs in v2', () => {
        const activity = createAgenticActivity({
          id: 'agent-1',
          name: 'AI Agent',
          inputs: '{"key": "val"}',
        })

        expect(activity.config).not.toHaveProperty('inputs')
      })
    })

    describe('createConditionActivity', () => {
      it('creates a condition activity', () => {
        const activity = createConditionActivity('cond-1', 'Check Status', 'status === "active"')

        expect(activity.type).toBe('condition')
        expect(activity.id).toBe('cond-1')
        expect(activity.name).toBe('Check Status')
        expect(activity.config.condition).toBe('status === "active"')
      })
    })

    describe('createLoopActivity', () => {
      it('creates a forEach loop activity', () => {
        const activity = createLoopActivity('loop-1', 'Process Items', 'forEach', {
          items: '{{ items }}',
          itemVariable: 'item',
          indexVariable: 'idx',
        })

        expect(activity.type).toBe('loop')
        expect(activity.id).toBe('loop-1')
        expect(activity.config.type).toBe('for_each')
        expect(activity.config.items).toBe('{{ items }}')
      })

      it('creates a while loop activity', () => {
        const activity = createLoopActivity('loop-1', 'While Loop', 'while', {
          condition: 'count < 10',
          maxIterations: 100,
        })

        expect(activity.config.type).toBe('do_while')
        expect(activity.config.condition).toBe('count < 10')
        expect(activity.config.max_iterations).toBe(100)
      })

      it('does not include invalid maxIterations', () => {
        const activity = createLoopActivity('loop-1', 'While Loop', 'while', {
          condition: 'count < 10',
          maxIterations: Number.NaN,
        })

        expect(activity.config).not.toHaveProperty('max_iterations')
      })

      it('falls back to for_each with empty items when config is missing', () => {
        const activity = createLoopActivity('loop-1', 'Loop', 'forEach', {})

        expect(activity.config.type).toBe('for_each')
        expect(activity.config.items).toBe('')
      })

      it('falls back when while has no condition', () => {
        const activity = createLoopActivity('loop-1', 'Loop', 'while', {})

        expect(activity.config.type).toBe('do_while')
        expect(activity.config.condition).toBe('')
      })
    })

    describe('createConvergeActivity', () => {
      it('creates a converge activity', () => {
        const activity = createConvergeActivity('conv-1', 'Wait for All')

        expect(activity.type).toBe('converge')
        expect(activity.id).toBe('conv-1')
        expect(activity.name).toBe('Wait for All')
        expect(activity.config.strategy).toBe('all')
      })

      it('creates a converge activity with config', () => {
        const activity = createConvergeActivity('conv-1', 'Converge', {
          timeout: 3600,
          onTimeout: 'fail',
          aggregateOutputs: true,
        })

        expect(activity.config.on_timeout).toBe('fail')
        expect(activity.config.strategy).toBe('all')
      })

      it('creates a converge activity with strategy', () => {
        const activity = createConvergeActivity('conv-1', 'Converge', {
          strategy: 'any',
          timeout: 600,
        })

        expect(activity.config.strategy).toBe('any')
      })

      it('creates a converge activity with strategy any and optional fields', () => {
        const activity = createConvergeActivity('conv-1', 'Converge Any', {
          strategy: 'any',
          requiredPathCount: 2,
          remainingBehavior: 'cancel',
        })

        expect(activity.config.strategy).toBe('any')
      })
    })

    describe('createAAPJobTemplateActivity', () => {
      it('creates an AAP job template activity', () => {
        const activity = createAAPJobTemplateActivity('aap-1', 'Run Playbook', 123)

        expect(activity.type).toBe('aap_job_template')
        expect(activity.id).toBe('aap-1')
        expect(activity.config.job_template_id).toBe(123)
      })

      it('creates an AAP activity with full config', () => {
        const activity = createAAPJobTemplateActivity('aap-1', 'Run Playbook', 123, {
          inventoryId: 456,
          extraVars: { env: 'prod' },
          limit: 'web-servers',
          tags: 'deploy',
          skipTags: 'test',
          verbosity: 2,
          jobType: 'run',
          forks: 10,
          timeout: 3600,
          jobSliceCount: 2,
          diffMode: true,
        })

        expect(activity.config.inventory_id).toBe(456)
        expect(activity.config.extra_vars).toEqual({ env: 'prod' })
        expect(activity.config.limit).toBe('web-servers')
        expect(activity.config.tags).toBe('deploy')
        expect(activity.config.skip_tags).toBe('test')
        expect(activity.config.verbosity).toBe(2)
        expect(activity.config.job_type).toBe('run')
        expect(activity.config.forks).toBe(10)
        expect(activity.config.timeout).toBe(3600)
        expect(activity.config.job_slice_count).toBe(2)
        expect(activity.config.diff_mode).toBe(true)
      })
    })

    describe('createGenericActivity', () => {
      it('creates a generic placeholder activity', () => {
        const activity = createGenericActivity('gen-1')

        expect(activity.type).toBe('generic')
        expect(activity.id).toBe('gen-1')
        expect(activity.name).toBe('New Step')
        expect((activity.metadata as { __isGeneric?: boolean })?.__isGeneric).toBe(true)
      })

      it('creates a generic activity with custom name', () => {
        const activity = createGenericActivity('gen-1', 'Custom Name')

        expect(activity.name).toBe('Custom Name')
      })

      it('creates a generic activity with custom message', () => {
        const activity = createGenericActivity('gen-1', 'Step', 'Select a step type')

        expect((activity.metadata as { __customMessage?: string })?.__customMessage).toBe('Select a step type')
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
        expect(activity.config).toEqual({})
      })

      it('creates an approval activity with timeout', () => {
        const activity = createApprovalActivity({
          id: 'appr-1',
          name: 'Approval',
          approvers: ['admin@example.com'],
          prompt: 'Approve?',
          timeout: 3600,
        })

        expect(activity.config.approver_timeout).toBe(3600)
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

        expect(activity.config.approver_timeout).toBe(3600)
      })
    })
  })
})
