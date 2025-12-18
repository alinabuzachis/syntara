import { ScrollArea } from '@base-ui-components/react'
import { CodeBlock as PFCodeBlock, CodeBlockCode } from '@patternfly/react-core'

export function CodeBlock(props: { children?: React.ReactNode; jsonObject?: object; noMaxHeight?: boolean }) {
  const codeContent = props.children ?? (props.jsonObject && JSON.stringify(props.jsonObject, undefined, 2))

  if (props.noMaxHeight) {
    // When noMaxHeight is true, render without ScrollArea to allow parent scrolling
    return (
      <PFCodeBlock>
        <CodeBlockCode>{codeContent}</CodeBlockCode>
      </PFCodeBlock>
    )
  }

  return (
    <ScrollArea.Root
      style={{
        maxHeight: '24rem',
        overflow: 'hidden',
      }}
    >
      <ScrollArea.Viewport style={{ height: '100%', overscrollBehavior: 'contain' }}>
        <PFCodeBlock>
          <CodeBlockCode>{codeContent}</CodeBlockCode>
        </PFCodeBlock>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar
        style={{
          zIndex: 20,
          margin: 'var(--pf-t--global--spacer--sm) var(--pf-t--global--spacer--md)',
          width: '0.5rem',
          display: 'flex',
          justifyContent: 'center',
          borderRadius: 'var(--pf-t--global--BorderRadius--sm)',
          opacity: 0,
          transition: 'opacity 0.3s ease-in-out',
        }}
        className="data-[hovering]:opacity-100 data-[scrolling]:opacity-100"
      >
        <ScrollArea.Thumb
          style={{
            width: '100%',
            borderRadius: 'var(--pf-t--global--BorderRadius--sm)',
            backgroundColor: 'var(--pf-t--global--color--nonstatus--gray--default)',
          }}
        />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  )
}
