import { CodeBlock as PFCodeBlock, CodeBlockAction, CodeBlockCode, ClipboardCopyButton } from '@patternfly/react-core'
import { useId, useState } from 'react'

import { detachPromise } from '../../utils/detachPromise'

export function CodeBlock(props: {
  children?: React.ReactNode
  jsonObject?: object
  noMaxHeight?: boolean
  enableCopy?: boolean
  fillHeight?: boolean
  copyContent?: string
}) {
  const codeContent = props.children ?? (props.jsonObject && JSON.stringify(props.jsonObject, undefined, 2))

  let copyText = props.copyContent ?? ''
  if (!copyText) {
    if (typeof codeContent === 'string') {
      copyText = codeContent
    } else if (props.jsonObject) {
      copyText = JSON.stringify(props.jsonObject, undefined, 2)
    }
  }
  const copyButtonId = useId()
  const [isCopied, setIsCopied] = useState(false)

  const handleCopy = () => {
    if (!copyText || !navigator.clipboard?.writeText) return
    detachPromise(
      navigator.clipboard
        .writeText(copyText)
        .then(() => {
          setIsCopied(true)
          window.setTimeout(() => setIsCopied(false), 2000)
        })
        .catch(() => {
          // Clipboard denied or unavailable — do not show success state
        })
    )
  }

  const copyAction = props.enableCopy ? (
    <CodeBlockAction>
      <ClipboardCopyButton variant="plain" id={copyButtonId} aria-label="Copy to clipboard" onClick={handleCopy}>
        {isCopied ? 'Copied to clipboard' : 'Copy to clipboard'}
      </ClipboardCopyButton>
    </CodeBlockAction>
  ) : undefined

  if (props.noMaxHeight) {
    // When noMaxHeight is true, render without scrollable container to allow parent scrolling
    return (
      <PFCodeBlock actions={copyAction}>
        <CodeBlockCode>{codeContent}</CodeBlockCode>
      </PFCodeBlock>
    )
  }

  return (
    <div
      style={{
        maxHeight: props.fillHeight ? 'none' : '24rem',
        height: props.fillHeight ? '100%' : undefined,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      <PFCodeBlock actions={copyAction}>
        <CodeBlockCode>{codeContent}</CodeBlockCode>
      </PFCodeBlock>
    </div>
  )
}
