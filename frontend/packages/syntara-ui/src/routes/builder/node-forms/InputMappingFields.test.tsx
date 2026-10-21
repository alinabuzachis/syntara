import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { InputMappingFields, type VariableOption } from './InputMappingFields'
import type { InvocationInputField } from './invocationSchemaUtils'

const schemaFields: InvocationInputField[] = [
  { name: 'host', type: 'string', required: true, description: 'Child target host' },
  { name: 'port', type: 'integer', required: false, defaultValue: 22 },
]
const variableOptions: VariableOption[] = [{ label: 'Lookup · hostname', expression: '${lookup.hostname}' }]

function StatefulMapping({
  fields = schemaFields,
  initialValues = {},
  isDisabled = false,
}: {
  fields?: InvocationInputField[]
  initialValues?: Record<string, unknown>
  isDisabled?: boolean
}) {
  const [values, setValues] = useState(initialValues)
  const [freeformJson, setFreeformJson] = useState('{}')

  return (
    <InputMappingFields
      fields={fields}
      values={values}
      onChange={setValues}
      variableOptions={variableOptions}
      freeformJson={freeformJson}
      onFreeformJsonChange={setFreeformJson}
      isDisabled={isDisabled}
    />
  )
}

describe('InputMappingFields', () => {
  it('renders a field for each declared child input and shows defaults', () => {
    render(<StatefulMapping />)

    expect(screen.getByRole('textbox', { name: 'host' })).toBeRequired()
    expect(screen.getByRole('textbox', { name: 'host' })).toHaveAccessibleDescription('Child target host')
    expect(screen.getByRole('textbox', { name: 'port' })).toHaveValue('22')
    expect(screen.getByRole('button', { name: 'Insert variable for host' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Insert variable for port' })).toBeInTheDocument()
  })

  it('updates a child input value as the user types', async () => {
    const user = userEvent.setup()
    render(<StatefulMapping />)

    await user.type(screen.getByRole('textbox', { name: 'host' }), 'server.example')

    expect(screen.getByRole('textbox', { name: 'host' })).toHaveValue('server.example')
  })

  it('opens the variable picker and inserts the selected expression', async () => {
    const user = userEvent.setup()
    render(<StatefulMapping initialValues={{ host: 'server=' }} />)

    await user.click(screen.getByRole('button', { name: 'Insert variable for host' }))
    await user.click(screen.getByRole('button', { name: 'Lookup · hostname' }))

    expect(screen.getByRole('textbox', { name: 'host' })).toHaveValue('server=${lookup.hostname}')
  })

  it('shows free-form JSON when the child schema declares no fields', () => {
    render(<StatefulMapping fields={[]} />)

    expect(screen.getByRole('textbox', { name: 'Input Mapping JSON' })).toHaveValue('{}')
    expect(screen.getByText('Enter a JSON object with child input values.')).toBeInTheDocument()
  })

  it('updates free-form JSON', async () => {
    const user = userEvent.setup()
    render(<StatefulMapping fields={[]} />)
    const mappingInput = screen.getByRole('textbox', { name: 'Input Mapping JSON' })

    await user.click(mappingInput)
    await user.clear(mappingInput)
    await user.paste('{"host":"server.example"}')

    expect(mappingInput).toHaveValue('{"host":"server.example"}')
  })

  it('disables fields and variable picker in version view', () => {
    render(<StatefulMapping isDisabled />)

    expect(screen.getByRole('textbox', { name: 'host' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Insert variable for host' })).toBeDisabled()
  })

  it('shows form errors for invalid free-form JSON', () => {
    render(
      <InputMappingFields
        fields={[]}
        values={{}}
        onChange={vi.fn()}
        variableOptions={[]}
        freeformJson="[]"
        onFreeformJsonChange={vi.fn()}
        error="Input mapping must be a JSON object."
      />
    )

    expect(screen.getByText('Input mapping must be a JSON object.')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<StatefulMapping />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
