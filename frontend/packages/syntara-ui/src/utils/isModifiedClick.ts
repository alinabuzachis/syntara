/** Whether a mouse event carries a modifier key or non-primary button, signalling the browser should handle it natively (e.g. open in new tab). Mirrors TanStack Router's isCtrlEvent + button check. */
export function isModifiedClick(
  e: Pick<MouseEvent, 'metaKey' | 'altKey' | 'ctrlKey' | 'shiftKey' | 'button'>
): boolean {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey || e.button !== 0)
}
