import { describe, expect, it } from 'vitest'

import { DEFAULT_WORKFLOW_NAME, getNextDefaultWorkflowName } from './workflowNaming'

describe('getNextDefaultWorkflowName', () => {
  it('returns DEFAULT_WORKFLOW_NAME when no names exist', () => {
    expect(getNextDefaultWorkflowName([])).toBe(DEFAULT_WORKFLOW_NAME)
  })

  it('returns new-workflow when name is not taken', () => {
    expect(getNextDefaultWorkflowName(['Other Workflow', 'My Automation'])).toBe('new-workflow')
  })

  it('returns new-workflow-1 when new-workflow exists', () => {
    expect(getNextDefaultWorkflowName(['new-workflow'])).toBe('new-workflow-1')
  })

  it('returns new-workflow-2 when new-workflow and new-workflow-1 exist', () => {
    expect(getNextDefaultWorkflowName(['new-workflow', 'new-workflow-1'])).toBe('new-workflow-2')
  })

  it('returns new-workflow-3 when 1 and 2 exist', () => {
    expect(getNextDefaultWorkflowName(['new-workflow', 'new-workflow-1', 'new-workflow-2'])).toBe('new-workflow-3')
  })

  it('ignores empty string names', () => {
    expect(getNextDefaultWorkflowName(['new-workflow', ''])).toBe('new-workflow-1')
  })

  it('accepts workflow-like objects with name property', () => {
    expect(getNextDefaultWorkflowName([{ name: 'new-workflow' }])).toBe('new-workflow-1')
    expect(getNextDefaultWorkflowName([{ name: 'new-workflow' }, { name: 'new-workflow-1' }])).toBe('new-workflow-2')
    expect(getNextDefaultWorkflowName([{ name: 'Other' }, { name: null }])).toBe('new-workflow')
  })
})
