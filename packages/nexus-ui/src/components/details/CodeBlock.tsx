import { CodeBlock as PFCodeBlock, CodeBlockCode } from '@patternfly/react-core'

export function CodeBlock(props: { children?: React.ReactNode; jsonObject?: object; noMaxHeight?: boolean }) {
  const codeContent = props.children ?? (props.jsonObject && JSON.stringify(props.jsonObject, undefined, 2))

  if (props.noMaxHeight) {
    // When noMaxHeight is true, render without scrollable container to allow parent scrolling
    return (
      <PFCodeBlock>
        <CodeBlockCode>{codeContent}</CodeBlockCode>
      </PFCodeBlock>
    )
  }

  return (
    <div
      style={{
        maxHeight: '24rem',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      <PFCodeBlock>
        <CodeBlockCode>{codeContent}</CodeBlockCode>
      </PFCodeBlock>
    </div>
  )
}
