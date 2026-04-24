import { Button, Label, Tooltip } from '@patternfly/react-core'
import { CopyIcon } from '@patternfly/react-icons'
import { useCallback, useRef, useState } from 'react'

import { useCopyToClipboard } from '../../../../hooks/useCopyToClipboard'

import styles from './DraggableTreeLeaf.module.css'

type DraggableTreeLeafProps = {
  label: string
  secondaryText?: string
  onDragStart: (e: React.DragEvent) => void
}

export function DraggableTreeLeaf({ label, secondaryText, onDragStart }: Readonly<DraggableTreeLeafProps>) {
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- drag source; keyboard copy via CopyExpressionAction
    <div draggable="true" onDragStart={onDragStart} className={styles.dragContainer}>
      <Label isCompact color="grey">
        {label}
      </Label>
      {secondaryText && <span className={styles.secondaryText}>{secondaryText}</span>}
    </div>
  )
}

/**
 * Keyboard-accessible copy button for tree view items.
 * Renders via TreeViewDataItem `action` prop (outside the node button)
 * to avoid nested-interactive a11y violations.
 */
export function CopyExpressionAction({ expressionText }: Readonly<{ expressionText: string }>) {
  const { isCopied, copy } = useCopyToClipboard()
  const [announcement, setAnnouncement] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCopy = useCallback(() => {
    copy(expressionText)
    // Clear then set to re-trigger announcement for repeated clicks
    setAnnouncement('')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setAnnouncement('Expression copied to clipboard. Paste it into any field.')
    }, 50)
  }, [copy, expressionText])

  return (
    <>
      <Tooltip content={isCopied ? 'Copied!' : `Copy ${expressionText}`}>
        <Button
          variant="plain"
          aria-label={`Copy expression ${expressionText}`}
          onClick={handleCopy}
          icon={<CopyIcon />}
          size="sm"
        />
      </Tooltip>
      <span aria-live="polite" role="status" className="pf-v6-u-screen-reader">
        {announcement}
      </span>
    </>
  )
}
