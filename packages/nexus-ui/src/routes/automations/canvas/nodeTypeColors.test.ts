import { ExecutorTypeEnum } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import { FlowNodeType, RegistryNodeId } from '../../../constants'

import { DetectedExecutorType } from './nodes/common/detectTaskNodeType'
import { getAddNodePanelColor, getNodeTypeColor, NODE_TYPE_COLORS } from './nodeTypeColors'

describe('getNodeTypeColor', () => {
  it('returns trigger color for trigger node type', () => {
    expect(getNodeTypeColor(FlowNodeType.TRIGGER)).toBe(NODE_TYPE_COLORS.trigger)
  })

  it('returns approval color for approval node type', () => {
    expect(getNodeTypeColor(FlowNodeType.APPROVAL)).toBe(NODE_TYPE_COLORS.approval)
  })

  it('returns logic color for condition, loop, converge, parallel', () => {
    expect(getNodeTypeColor(FlowNodeType.CONDITION)).toBe(NODE_TYPE_COLORS.logic)
    expect(getNodeTypeColor(FlowNodeType.LOOP)).toBe(NODE_TYPE_COLORS.logic)
    expect(getNodeTypeColor(FlowNodeType.CONVERGE)).toBe(NODE_TYPE_COLORS.logic)
    expect(getNodeTypeColor(FlowNodeType.PARALLEL)).toBe(NODE_TYPE_COLORS.logic)
  })

  it('returns generic color for generic node type', () => {
    expect(getNodeTypeColor(FlowNodeType.GENERIC)).toBe(NODE_TYPE_COLORS.generic)
  })

  it('returns actionScript color for task with script executor', () => {
    expect(
      getNodeTypeColor(FlowNodeType.TASK, {
        type: 'task',
        task: { executor: ExecutorTypeEnum.SCRIPT, config: {} },
      } as Parameters<typeof getNodeTypeColor>[1])
    ).toBe(NODE_TYPE_COLORS.actionScript)
  })

  it('returns actionAap color for task with aap_job_template executor', () => {
    expect(
      getNodeTypeColor(FlowNodeType.TASK, {
        type: 'task',
        task: { executor: ExecutorTypeEnum.AAP_JOB_TEMPLATE, config: {} },
      } as Parameters<typeof getNodeTypeColor>[1])
    ).toBe(NODE_TYPE_COLORS.actionAap)
  })

  it('returns actionAap color when detectTaskNodeType resolves actualExecutor to aap (connector workaround)', () => {
    expect(
      getNodeTypeColor(FlowNodeType.TASK, {
        type: 'task',
        task: { executor: DetectedExecutorType.AAP, config: {} },
      } as Parameters<typeof getNodeTypeColor>[1])
    ).toBe(NODE_TYPE_COLORS.actionAap)
  })

  it('returns actionAgentic color for task with agentic executor', () => {
    expect(
      getNodeTypeColor(FlowNodeType.TASK, {
        type: 'task',
        task: { executor: ExecutorTypeEnum.AGENTIC, config: {} },
      } as Parameters<typeof getNodeTypeColor>[1])
    ).toBe(NODE_TYPE_COLORS.actionAgentic)
  })

  it('returns actionDefault for task with api executor', () => {
    expect(
      getNodeTypeColor(FlowNodeType.TASK, {
        type: 'task',
        task: { executor: ExecutorTypeEnum.API, config: {} },
      } as Parameters<typeof getNodeTypeColor>[1])
    ).toBe(NODE_TYPE_COLORS.actionDefault)
  })

  it('returns actionDefault for task-reversed with no data', () => {
    expect(getNodeTypeColor(FlowNodeType.TASK_REVERSED)).toBe(NODE_TYPE_COLORS.actionDefault)
  })

  it('returns actionDefault for unknown node type', () => {
    expect(getNodeTypeColor('unknown')).toBe(NODE_TYPE_COLORS.actionDefault)
  })
})

describe('getAddNodePanelColor', () => {
  it('returns undefined for trigger and trigger subtypes', () => {
    expect(getAddNodePanelColor(RegistryNodeId.TRIGGER)).toBeUndefined()
    expect(getAddNodePanelColor(RegistryNodeId.TRIGGER_MANUAL)).toBeUndefined()
    expect(getAddNodePanelColor(RegistryNodeId.TRIGGER_SCHEDULED)).toBeUndefined()
  })

  it('returns logic color for logic and logic subtypes', () => {
    expect(getAddNodePanelColor(RegistryNodeId.LOGIC)).toBe(NODE_TYPE_COLORS.logic)
    expect(getAddNodePanelColor(RegistryNodeId.LOGIC_CONDITION)).toBe(NODE_TYPE_COLORS.logic)
    expect(getAddNodePanelColor(RegistryNodeId.LOGIC_CONVERGE)).toBe(NODE_TYPE_COLORS.logic)
    expect(getAddNodePanelColor(RegistryNodeId.LOGIC_LOOP)).toBe(NODE_TYPE_COLORS.logic)
  })

  it('returns approval color for approval', () => {
    expect(getAddNodePanelColor(RegistryNodeId.APPROVAL)).toBe(NODE_TYPE_COLORS.approval)
  })

  it('returns actionScript color for action and action subtypes', () => {
    expect(getAddNodePanelColor(RegistryNodeId.ACTION)).toBe(NODE_TYPE_COLORS.actionScript)
    expect(getAddNodePanelColor(RegistryNodeId.ACTION_SCRIPT)).toBe(NODE_TYPE_COLORS.actionScript)
    expect(getAddNodePanelColor(RegistryNodeId.ACTION_API)).toBe(NODE_TYPE_COLORS.actionScript)
  })

  it('returns actionAgentic color for agent', () => {
    expect(getAddNodePanelColor(RegistryNodeId.AGENT)).toBe(NODE_TYPE_COLORS.actionAgentic)
  })

  it('returns actionAap color for aap', () => {
    expect(getAddNodePanelColor(RegistryNodeId.AAP)).toBe(NODE_TYPE_COLORS.actionAap)
  })

  it('returns undefined for empty or unknown registry id', () => {
    expect(getAddNodePanelColor('')).toBeUndefined()
    expect(getAddNodePanelColor('unknown')).toBeUndefined()
  })
})
