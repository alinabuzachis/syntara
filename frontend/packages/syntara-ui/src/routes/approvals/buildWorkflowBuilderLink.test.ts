import { describe, expect, it } from 'vitest'

import { buildWorkflowBuilderLink } from './buildWorkflowBuilderLink'

describe('buildWorkflowBuilderLink', () => {
  it('includes the version query param when version is provided', () => {
    expect(buildWorkflowBuilderLink('wf-1', 3)).toBe('/workflow-builder/wf-1?version=3')
  })

  it('omits the version query param when version is null', () => {
    expect(buildWorkflowBuilderLink('wf-1', null)).toBe('/workflow-builder/wf-1')
  })

  it('omits the version query param when version is undefined', () => {
    expect(buildWorkflowBuilderLink('wf-1', undefined)).toBe('/workflow-builder/wf-1')
  })

  it('treats version 0 as a valid version', () => {
    expect(buildWorkflowBuilderLink('wf-1', 0)).toBe('/workflow-builder/wf-1?version=0')
  })
})
