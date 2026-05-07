import { describe, expect, it } from 'vitest'

import { aapWorkflowTemplateSchema } from './aapWorkflowTemplateSchema'

describe('aapWorkflowTemplateSchema', () => {
  it('validates valid workflow template configuration with ID', () => {
    const validData = {
      name: 'Deploy Workflow',
      organization_id: 1,
      organization_name: 'Engineering',
      workflow_job_template_id: 10,
      workflow_job_template_name: 'Deploy Application',
    }

    const result = aapWorkflowTemplateSchema.safeParse(validData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('Deploy Workflow')
      expect(result.data.workflow_job_template_id).toBe(10)
    }
  })

  it('validates valid workflow template configuration with name only', () => {
    const validData = {
      name: 'Deploy Workflow',
      organization_name: 'Engineering',
      workflow_job_template_name: 'Deploy Application',
    }

    const result = aapWorkflowTemplateSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  it('validates configuration with expression mode fields', () => {
    const validData = {
      name: 'Dynamic Workflow',
      organization_name: '{{workflow.context.organization}}',
      workflow_job_template_name: '{{workflow.context.template}}',
    }

    const result = aapWorkflowTemplateSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  it('validates configuration with optional prompt-on-launch fields', () => {
    const validData = {
      name: 'Deploy Workflow',
      organization_name: 'Engineering',
      workflow_job_template_name: 'Deploy Application',
      inventory_id: 100,
      inventory_name: 'Production',
      limit: 'webservers',
      scm_branch: 'main',
      labels: ['production', 'critical'],
      tags: 'deploy,update',
      skip_tags: 'test',
      extra_vars: '{"environment": "prod"}',
      credential_id: 'cred-123',
    }

    const result = aapWorkflowTemplateSchema.safeParse(validData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.limit).toBe('webservers')
      expect(result.data.scm_branch).toBe('main')
      expect(result.data.labels).toEqual(['production', 'critical'])
    }
  })

  it('requires organization_name when workflow_job_template_name is provided without ID', () => {
    const invalidData = {
      name: 'Deploy Workflow',
      workflow_job_template_name: 'Deploy Application',
      // Missing organization_name
    }

    const result = aapWorkflowTemplateSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  it('requires workflow_job_template_name or workflow_job_template_id', () => {
    const invalidData = {
      name: 'Deploy Workflow',
      organization_name: 'Engineering',
      // Missing both workflow_job_template_name and workflow_job_template_id
    }

    const result = aapWorkflowTemplateSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  it('accepts empty string for optional fields', () => {
    const validData = {
      name: 'Deploy Workflow',
      organization_name: 'Engineering',
      organization_id: 1,
      workflow_job_template_name: 'Deploy Application',
      workflow_job_template_id: 10,
      limit: '',
      scm_branch: '',
      tags: '',
      skip_tags: '',
      extra_vars: '',
    }

    const result = aapWorkflowTemplateSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  it('validates credential_id as optional string', () => {
    const validDataWithCred = {
      name: 'Deploy Workflow',
      organization_name: 'Engineering',
      organization_id: 1,
      workflow_job_template_name: 'Deploy Application',
      workflow_job_template_id: 10,
      credential_id: 'credential-uuid-123',
    }

    const validDataWithoutCred = {
      name: 'Deploy Workflow',
      organization_name: 'Engineering',
      organization_id: 1,
      workflow_job_template_name: 'Deploy Application',
      workflow_job_template_id: 10,
    }

    expect(aapWorkflowTemplateSchema.safeParse(validDataWithCred).success).toBe(true)
    expect(aapWorkflowTemplateSchema.safeParse(validDataWithoutCred).success).toBe(true)
  })

  it('validates labels as array of strings', () => {
    const validData = {
      name: 'Deploy Workflow',
      organization_name: 'Engineering',
      organization_id: 1,
      workflow_job_template_name: 'Deploy Application',
      workflow_job_template_id: 10,
      labels: ['prod', 'critical', 'webapp'],
    }

    const result = aapWorkflowTemplateSchema.safeParse(validData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.labels).toHaveLength(3)
      expect(result.data.labels).toContain('critical')
    }
  })

  it('validates inventory with both ID and name', () => {
    const validData = {
      name: 'Deploy Workflow',
      organization_name: 'Engineering',
      organization_id: 1,
      workflow_job_template_name: 'Deploy Application',
      workflow_job_template_id: 10,
      inventory_id: 42,
      inventory_name: 'Production Inventory',
    }

    const result = aapWorkflowTemplateSchema.safeParse(validData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.inventory_id).toBe(42)
      expect(result.data.inventory_name).toBe('Production Inventory')
    }
  })
})
