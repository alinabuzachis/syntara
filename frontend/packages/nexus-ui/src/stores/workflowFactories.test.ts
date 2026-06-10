import { EdgeHandleEnum } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import { buildSwitchCasePort } from '../routes/builder/utils/switchCaseHelpers'

import {
  createAgenticActivity,
  createAAPJobTemplateActivity,
  createAAPWorkflowTemplateActivity,
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
  createSwitchActivity,
  createWaitActivity,
  createWebhookTrigger,
  createEdaTrigger,
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

    describe('createWebhookTrigger', () => {
      it('creates a webhook trigger with path', () => {
        const trigger = createWebhookTrigger('trigger-20', 'jira-updates')

        expect(trigger.id).toBe('trigger-20')
        expect(trigger.type).toBe('webhook_trigger')
        expect(trigger.name).toBe('Webhook Trigger')
        expect(trigger.config.webhook_path).toBe('jira-updates')
        expect(trigger.config).not.toHaveProperty('input_schema')
      })

      it('creates a webhook trigger with JSON schema', () => {
        const schema = { type: 'object', properties: { name: { type: 'string' } } }
        const trigger = createWebhookTrigger('trigger-21', 'github-push', schema)

        expect(trigger.id).toBe('trigger-21')
        expect(trigger.config.webhook_path).toBe('github-push')
        expect(trigger.config.input_schema).toEqual(schema)
      })

      it('creates a webhook trigger with custom name', () => {
        const trigger = createWebhookTrigger('trigger-22', 'slack-events', undefined, 'Slack Webhook')

        expect(trigger.id).toBe('trigger-22')
        expect(trigger.name).toBe('Slack Webhook')
      })

      it('throws for invalid webhook path format', () => {
        expect(() => createWebhookTrigger('trigger-23', 'api/v2/events')).toThrow('Invalid webhook path format')
        expect(() => createWebhookTrigger('trigger-24', '')).toThrow('Invalid webhook path format')
        expect(() => createWebhookTrigger('trigger-25', '-leading-hyphen')).toThrow('Invalid webhook path format')
      })
    })

    describe('createEdaTrigger', () => {
      it('creates an EDA trigger with path', () => {
        const trigger = createEdaTrigger('trigger-30', 'eda-events')

        expect(trigger.id).toBe('trigger-30')
        expect(trigger.type).toBe('eda_trigger')
        expect(trigger.name).toBe('EDA Trigger')
        expect(trigger.config.webhook_path).toBe('eda-events')
        expect(trigger.config).not.toHaveProperty('input_schema')
      })

      it('creates an EDA trigger with JSON schema', () => {
        const schema = { type: 'object', properties: { name: { type: 'string' } } }
        const trigger = createEdaTrigger('trigger-31', 'eda-push', schema)

        expect(trigger.id).toBe('trigger-31')
        expect(trigger.config.webhook_path).toBe('eda-push')
        expect(trigger.config.input_schema).toEqual(schema)
      })

      it('creates an EDA trigger with custom name', () => {
        const trigger = createEdaTrigger('trigger-32', 'eda-alerts', undefined, 'My EDA Trigger')

        expect(trigger.id).toBe('trigger-32')
        expect(trigger.name).toBe('My EDA Trigger')
      })

      it('rejects invalid webhook path format', () => {
        expect(() => createEdaTrigger('trigger-33', 'api/v2/events')).toThrow('Invalid webhook path format')
        expect(() => createEdaTrigger('trigger-34', '')).toThrow('Invalid webhook path format')
        expect(() => createEdaTrigger('trigger-35', '-leading-hyphen')).toThrow('Invalid webhook path format')
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

      it('creates a converge activity with strategy any and n_required', () => {
        const activity = createConvergeActivity('conv-1', 'Converge Any', {
          strategy: 'any',
          requiredPathCount: 2,
        })

        expect(activity.config.strategy).toBe('any')
        expect(activity.config.n_required).toBe(2)
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
          inventory: 456,
          extraVars: { env: 'prod' },
          limit: 'web-servers',
          tags: 'deploy',
          skipTags: 'test',
          verbosity: 2,
          jobType: 'run',
          forks: 10,
          timeout: 3600,
          jobSlicing: 2,
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

    describe('createAAPWorkflowTemplateActivity', () => {
      it('creates an AAP workflow template activity', () => {
        const activity = createAAPWorkflowTemplateActivity('aap-wf-1', 'Run Workflow', 456)

        expect(activity.type).toBe('aap_workflow_job_template')
        expect(activity.id).toBe('aap-wf-1')
        expect(activity.config.workflow_job_template_id).toBe(456)
      })

      it('creates an AAP workflow template activity with full config', () => {
        const activity = createAAPWorkflowTemplateActivity('aap-wf-1', 'Run Workflow', 456, {
          inventory_id: 789,
          extra_vars: { env: 'staging' },
          limit: 'db-servers',
          scm_branch: 'main',
          tags: 'deploy',
          skip_tags: 'debug',
          labels: ['production', 'critical'],
        })

        expect(activity.config.workflow_job_template_id).toBe(456)
        expect(activity.config.inventory_id).toBe(789)
        expect(activity.config.extra_vars).toEqual({ env: 'staging' })
        expect(activity.config.limit).toBe('db-servers')
        expect(activity.config.scm_branch).toBe('main')
        expect(activity.config.tags).toBe('deploy')
        expect(activity.config.skip_tags).toBe('debug')
        expect(activity.config.labels).toEqual(['production', 'critical'])
      })

      it('creates an AAP workflow template activity with credential and organization', () => {
        const activity = createAAPWorkflowTemplateActivity('aap-wf-1', 'Run Workflow', 456, {
          credential_id: 'cred-123',
          organization_id: 10,
          organization_name: 'Engineering',
        })

        expect(activity.config.credential_id).toBe('cred-123')
        expect(activity.config.organization_id).toBe(10)
        expect(activity.config.organization_name).toBe('Engineering')
      })

      it('creates an AAP workflow template activity with inventory name', () => {
        const activity = createAAPWorkflowTemplateActivity('aap-wf-1', 'Run Workflow', 456, {
          inventory_name: 'Production Inventory',
        })

        expect(activity.config.inventory_name).toBe('Production Inventory')
      })

      it('creates an AAP workflow template activity with workflow job template name', () => {
        const activity = createAAPWorkflowTemplateActivity('aap-wf-1', 'Run Workflow', 456, {
          workflow_job_template_name: 'Deploy Application',
        })

        expect(activity.config.workflow_job_template_name).toBe('Deploy Application')
      })

      it('does not include job-specific fields (job_type, verbosity, forks, etc.)', () => {
        const activity = createAAPWorkflowTemplateActivity('aap-wf-1', 'Run Workflow', 456, {
          inventory_id: 789,
          extra_vars: { env: 'prod' },
        })

        // Workflow templates should NOT have job-specific fields
        expect(activity.config).not.toHaveProperty('job_type')
        expect(activity.config).not.toHaveProperty('verbosity')
        expect(activity.config).not.toHaveProperty('forks')
        expect(activity.config).not.toHaveProperty('timeout')
        expect(activity.config).not.toHaveProperty('job_slice_count')
        expect(activity.config).not.toHaveProperty('diff_mode')
        expect(activity.config).not.toHaveProperty('execution_environment')
        expect(activity.config).not.toHaveProperty('execution_environment_id')
        expect(activity.config).not.toHaveProperty('instance_group_id')
        expect(activity.config).not.toHaveProperty('instance_group_name')
        expect(activity.config).not.toHaveProperty('job_credentials')
      })

      it('includes scm_branch field (workflow-specific)', () => {
        const activity = createAAPWorkflowTemplateActivity('aap-wf-1', 'Run Workflow', 456, {
          scm_branch: 'feature/new-deployment',
        })

        expect(activity.config.scm_branch).toBe('feature/new-deployment')
      })

      it('filters undefined values correctly', () => {
        const activity = createAAPWorkflowTemplateActivity('aap-wf-1', 'Run Workflow', 456, {
          inventory_id: undefined,
          extra_vars: undefined,
          limit: undefined,
        })

        expect(activity.config).not.toHaveProperty('inventory_id')
        expect(activity.config).not.toHaveProperty('extra_vars')
        expect(activity.config).not.toHaveProperty('limit')
      })

      it('handles numeric zero values correctly (defined predicate)', () => {
        const activity = createAAPWorkflowTemplateActivity('aap-wf-1', 'Run Workflow', 456, {
          inventory_id: 0,
          organization_id: 0,
        })

        // Zero is a valid value for numeric fields (defined predicate)
        expect(activity.config.inventory_id).toBe(0)
        expect(activity.config.organization_id).toBe(0)
      })

      it('filters invalid numeric values (NaN, Infinity)', () => {
        const activity = createAAPWorkflowTemplateActivity('aap-wf-1', 'Run Workflow', 456, {
          inventory_id: Number.NaN,
          organization_id: Number.POSITIVE_INFINITY,
        })

        expect(activity.config).not.toHaveProperty('inventory_id')
        expect(activity.config).not.toHaveProperty('organization_id')
      })

      it('filters empty strings for truthy predicate fields', () => {
        const activity = createAAPWorkflowTemplateActivity('aap-wf-1', 'Run Workflow', 456, {
          organization_name: '',
          workflow_job_template_name: '',
          limit: '',
        })

        expect(activity.config).not.toHaveProperty('organization_name')
        expect(activity.config).not.toHaveProperty('workflow_job_template_name')
        expect(activity.config).not.toHaveProperty('limit')
      })

      it('includes empty arrays for labels field', () => {
        const activity = createAAPWorkflowTemplateActivity('aap-wf-1', 'Run Workflow', 456, {
          labels: [],
        })

        // Empty array is still truthy in JavaScript (all objects are truthy)
        expect(activity.config.labels).toEqual([])
      })

      it('includes non-empty arrays for labels field', () => {
        const activity = createAAPWorkflowTemplateActivity('aap-wf-1', 'Run Workflow', 456, {
          labels: ['production'],
        })

        expect(activity.config.labels).toEqual(['production'])
      })
    })

    describe('createWaitActivity', () => {
      it('creates a wait activity with duration', () => {
        const activity = createWaitActivity('wait-1', 'Wait 5 min', { duration: 300 })

        expect(activity.type).toBe('wait')
        expect(activity.id).toBe('wait-1')
        expect(activity.name).toBe('Wait 5 min')
        expect(activity.config).toEqual({ duration: 300 })
      })

      it('creates a wait activity with zero duration', () => {
        const activity = createWaitActivity('wait-2', 'No Wait', { duration: 0 })

        expect(activity.type).toBe('wait')
        expect(activity.config).toEqual({ duration: 0 })
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

    describe('createSwitchActivity', () => {
      it('creates a switch activity with correct type and config', () => {
        const cases = [
          { port: buildSwitchCasePort(0), label: 'Path 1', condition: '${status} == "active"' },
          { port: buildSwitchCasePort(1), label: 'Path 2', condition: '${status} == "inactive"' },
        ]
        const activity = createSwitchActivity('switch-1', 'Route Request', cases)

        expect(activity.id).toBe('switch-1')
        expect(activity.type).toBe('switch')
        expect(activity.name).toBe('Route Request')
        expect(activity.config).toEqual({
          cases,
          default_port: EdgeHandleEnum.DEFAULT,
        })
      })

      it('creates a switch activity with empty cases', () => {
        const activity = createSwitchActivity('switch-2', 'Empty Switch', [])

        expect(activity.config.cases).toEqual([])
        expect(activity.config.default_port).toBe(EdgeHandleEnum.DEFAULT)
      })
    })
  })
})
