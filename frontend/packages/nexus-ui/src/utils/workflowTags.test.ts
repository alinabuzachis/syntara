import { describe, expect, it } from 'vitest'

import { getWorkflowLabelItems, getWorkflowTagsFromLabels, getWorkflowTagsForDisplay } from './workflowTags'

describe('getWorkflowTagsFromLabels', () => {
  it('returns empty array when workflow has no labels', () => {
    expect(getWorkflowTagsFromLabels({} as never)).toEqual([])
    expect(getWorkflowTagsFromLabels({ labels: null } as never)).toEqual([])
  })

  it('returns label keys as tag names', () => {
    const workflow = {
      labels: { deploy: '', prod: '', 'data-processing': '' },
    }
    expect(getWorkflowTagsFromLabels(workflow as never)).toEqual(['deploy', 'prod', 'data-processing'])
  })
})

describe('getWorkflowTagsForDisplay', () => {
  it('returns label keys as tags', () => {
    const workflow = { labels: { deploy: '', prod: '' } }
    expect(getWorkflowTagsForDisplay(workflow as never)).toEqual(['deploy', 'prod'])
  })

  it('returns empty array when workflow has no labels', () => {
    expect(getWorkflowTagsForDisplay({} as never)).toEqual([])
  })
})

describe('getWorkflowLabelItems', () => {
  it('returns empty array when workflow has no labels', () => {
    expect(getWorkflowLabelItems({} as never)).toEqual([])
    expect(getWorkflowLabelItems({ labels: null } as never)).toEqual([])
  })

  it('returns key=value strings for each label', () => {
    const workflow = {
      labels: { env: 'prod', team: 'platform' },
    }
    expect(getWorkflowLabelItems(workflow as never)).toEqual(['env=prod', 'team=platform'])
  })
})
