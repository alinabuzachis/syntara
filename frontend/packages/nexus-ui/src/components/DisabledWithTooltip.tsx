import { Tooltip } from '@patternfly/react-core'
import type { ReactElement } from 'react'

type DisabledWithTooltipProps = {
  /** Whether the action is disabled (e.g. due to missing permission). */
  isDisabled: boolean
  /** Tooltip explaining why the action is disabled. Use `permissionTooltip()` for the standard format. */
  content: string
  /**
   * A single React element to wrap. When disabled, PF `Tooltip` is added around
   * the child. The consumer is responsible for setting `isAriaDisabled` on the
   * child so it remains focusable for screen readers and hover.
   */
  children: ReactElement
}

/**
 * Conditionally wraps a child element in a PatternFly `Tooltip` when disabled.
 *
 * Does **not** set `isAriaDisabled` on the child — the consumer controls that
 * so it can also prevent the onClick handler. Use `isAriaDisabled` (not `isDisabled`)
 * on PatternFly buttons so the tooltip hover event still fires.
 *
 * @example
 * ```tsx
 * const { allowed: canDelete } = useCanI('delete', 'workflow')
 *
 * <DisabledWithTooltip
 *   isDisabled={!canDelete}
 *   content={permissionTooltip('delete this workflow', 'workflow:delete')}
 * >
 *   <Button isAriaDisabled={!canDelete} onClick={handleDelete}>Delete</Button>
 * </DisabledWithTooltip>
 * ```
 */
export function DisabledWithTooltip({ isDisabled, content, children }: Readonly<DisabledWithTooltipProps>) {
  if (!isDisabled) return children

  return <Tooltip content={content}>{children}</Tooltip>
}
