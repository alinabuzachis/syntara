import { JsonSchemaField } from './JsonSchemaField'

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
    <JsonSchemaField
      label="Input schema"
      defaultCode=""
      exampleCode={EXAMPLE_INPUT_SCHEMA}
      modalTitle="Edit input schema"
      ariaLabel="Input schema editor"
      downloadFilename="input-schema.json"
      helperText="Optional JSON Schema defining the input data required to run this workflow."
      error={errors.inputSchema?.message}
    />
  )
}
