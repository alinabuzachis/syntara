import type { Node } from '@xyflow/react'
import { describe, expect, it, vi } from 'vitest'

import type { NodeType } from '../../automations/canvas/nodes/NodeType'

import { buildPanelMenuActions } from './panelMenuActions'

describe('buildPanelMenuActions', () => {
  it('returns empty actions in add mode', () => {
    const actions = buildPanelMenuActions('add', undefined, [], vi.fn())
    expect(actions).toEqual([])
  })

  it('wraps delete action to close panel', () => {
    const onClose = vi.fn()
    const onDelete = vi.fn()
    const node: Node<NodeType['data']> = {
      id: 'task-1',
      type: 'task',
      position: { x: 0, y: 0 },
      data: { id: 'task-1', type: 'task', name: 'Task' } as never,
    }

    const actions = buildPanelMenuActions(
      'edit',
      node,
      [
        {
          id: 'delete',
          label: 'Delete',
          onClick: onDelete,
          variant: 'danger',
        },
      ],
      onClose
    )

    expect(actions).toHaveLength(1)
    actions[0].onClick()
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
