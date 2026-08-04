import type { TaskActivity } from '@syntara/contracts'

import { semanticZoomActivityTitle } from '../semanticZoom'

import { detectTaskNodeType } from './common/detectTaskNodeType'
import { executorMetadata } from './nodeMetadata'

/**
 * Title and type label for semantic-zoom tooltips on task-shaped canvas nodes.
 */
export function getTaskSemanticLabels(data: TaskActivity): { title: string; typeLabel: string } {
  const { actualExecutor } = detectTaskNodeType(data)
  const executorMeta = executorMetadata[actualExecutor]
  const typeLabel = executorMeta?.label ?? 'Task'

  return {
    title: semanticZoomActivityTitle(data.name, 'Untitled task'),
    typeLabel,
  }
}
