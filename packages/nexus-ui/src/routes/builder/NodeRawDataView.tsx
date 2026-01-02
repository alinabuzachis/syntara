import {
  CodeBlock as PFCodeBlock,
  CodeBlockCode,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
} from '@patternfly/react-core'
import type { Node } from '@xyflow/react'

import { CodeBlock } from '../../components/details/CodeBlock'
import type { NodeType } from '../automations/canvas/nodes/NodeType'

interface NodeRawDataViewProps {
  node: Node<NodeType['data']>
}

export function NodeRawDataView({ node }: NodeRawDataViewProps) {
  return (
    <DescriptionList>
      <DescriptionListGroup>
        <DescriptionListTerm>Node Type</DescriptionListTerm>
        <DescriptionListDescription>{node.type}</DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Node ID</DescriptionListTerm>
        <DescriptionListDescription>
          <PFCodeBlock>
            <CodeBlockCode>{node.id}</CodeBlockCode>
          </PFCodeBlock>
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Node Data</DescriptionListTerm>
        <DescriptionListDescription>
          <CodeBlock jsonObject={node.data} />
        </DescriptionListDescription>
      </DescriptionListGroup>
    </DescriptionList>
  )
}
