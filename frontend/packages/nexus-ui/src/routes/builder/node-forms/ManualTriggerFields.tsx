import { StackItem } from '@patternfly/react-core'

import { JsonSchemaField } from './JsonSchemaField'
import { nodeHelp } from './shared/nodeFieldHelp'

const EXAMPLE_INPUT_SCHEMA = JSON.stringify(
  {
    type: 'object',
    properties: {
      name: { type: 'string' },
    },
    required: ['name'],
  },
  null,
  2
)

export function ManualTriggerFields({
  errors,
}: Readonly<{ errors: Readonly<{ inputSchema?: { message?: string } }> }>) {
  return (
    <StackItem>
      <JsonSchemaField
        label="Input schema"
        labelHelp={nodeHelp.manualInputSchema}
        defaultCode=""
        exampleCode={EXAMPLE_INPUT_SCHEMA}
        modalTitle="Edit input schema"
        ariaLabel="Input schema editor"
        downloadFilename="input-schema.json"
        helperText="Optional JSON Schema defining the input data required to run this workflow."
        error={errors.inputSchema?.message}
      />
    </StackItem>
  )
}
