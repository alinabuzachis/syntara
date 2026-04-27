import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RegistryNodeId } from '../../../../constants'
import { useWorkflowStore } from '../../../../stores/useWorkflowStore'
import { NodeRegistry } from '../NodeRegistry'

import registerAAPNode from './registerAAPNode'

// Mock the store
vi.mock('../../../../stores/useWorkflowStore', () => ({
  useWorkflowStore: {
    getState: vi.fn(() => ({
      addActivity: vi.fn(),
    })),
  },
  createAAPJobTemplateActivity: vi.fn(
    (id: string, name: string, templateId: number, config: Record<string, unknown>) => ({
      id,
      name,
      type: 'aap_job_template' as const,
      config: { job_template_id: templateId, ...config },
    })
  ),
}))

describe('registerAAPNode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Unregister AAP node if it exists from previous test
    NodeRegistry.unregister(RegistryNodeId.AAP)
  })

  it('registers AAP node in the NodeRegistry', () => {
    registerAAPNode()

    const registration = NodeRegistry.get(RegistryNodeId.AAP)
    expect(registration).toBeDefined()
    expect(registration?.id).toBe(RegistryNodeId.AAP)
    expect(registration?.label).toBe('AAP Job Execution')
    expect(registration?.category).toBe('action')
    expect(registration?.description).toBe('Execute Ansible Automation Platform jobs')
  })

  it('registers with correct keywords for searchability', () => {
    registerAAPNode()

    const registration = NodeRegistry.get(RegistryNodeId.AAP)
    expect(registration?.keywords).toContain('ansible')
    expect(registration?.keywords).toContain('aap')
    expect(registration?.keywords).toContain('playbook')
  })

  it('includes form component and onSubmit handler', () => {
    registerAAPNode()

    const registration = NodeRegistry.get(RegistryNodeId.AAP)
    expect(registration?.formComponent).toBeDefined()
    expect(registration?.onSubmit).toBeDefined()
  })

  it('onSubmit creates activity and calls onSuccess', () => {
    const mockAddActivity = vi.fn()
    vi.mocked(useWorkflowStore.getState).mockReturnValue({
      addActivity: mockAddActivity,
    } as never)

    registerAAPNode()
    const registration = NodeRegistry.get(RegistryNodeId.AAP)
    const onSuccess = vi.fn()
    const onError = vi.fn()

    const formData = {
      name: 'Test AAP Job',
      organization_name: 'Default',
      job_template_name: 'Deploy App',
      job_template_id: 123,
      inventory_id: 456,
      extra_vars: '{"key": "value"}',
    }

    registration?.onSubmit(formData, onSuccess, onError)

    expect(onSuccess).toHaveBeenCalledWith(expect.any(String))
    expect(onError).not.toHaveBeenCalled()
    expect(mockAddActivity).toHaveBeenCalled()
  })

  it('onSubmit calls onError when job_template_id is invalid', () => {
    registerAAPNode()
    const registration = NodeRegistry.get(RegistryNodeId.AAP)
    const onSuccess = vi.fn()
    const onError = vi.fn()

    const formData = {
      name: 'Test AAP Job',
      organization_name: 'Default',
      job_template_name: 'Deploy App',
      job_template_id: undefined, // Invalid
    }

    registration?.onSubmit(formData, onSuccess, onError)

    expect(onError).toHaveBeenCalledWith(expect.any(String))
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('onSubmit handles errors and calls onError with message', () => {
    // Mock addActivity to throw
    const mockAddActivity = vi.fn(() => {
      throw new Error('Store error')
    })
    vi.mocked(useWorkflowStore.getState).mockReturnValue({
      addActivity: mockAddActivity,
    } as never)

    registerAAPNode()
    const registration = NodeRegistry.get(RegistryNodeId.AAP)
    const onSuccess = vi.fn()
    const onError = vi.fn()

    const formData = {
      name: 'Test AAP Job',
      organization_name: 'Default',
      job_template_name: 'Deploy App',
      job_template_id: 123,
    }

    registration?.onSubmit(formData, onSuccess, onError)

    expect(onError).toHaveBeenCalledWith('Store error')
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
