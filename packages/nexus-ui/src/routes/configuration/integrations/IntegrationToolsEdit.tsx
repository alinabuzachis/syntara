import { Form, FormSwitch } from '@ansible/nexus-ui-framework'
import type { Tool } from '@ansible/nexus-contracts'
import { useState } from 'react'

export default function IntegrationToolsEdit(props: {
  toolList: Tool[] | undefined
  handleSubmit: (tools: Tool[]) => void
}) {
  const [tools, setTools] = useState([...(props?.toolList ?? [])])

  const handleSwitchChange = (id: string, newValue: boolean) => {
    setTools(tools?.map((item) => (item.id === id ? { ...item, enabled: newValue } : item)) ?? [])
  }

  return (
    <Form<Tool[]>
      id="tools-form"
      onSubmit={() => {
        if (props?.handleSubmit) props.handleSubmit(tools)
      }}
    >
      {tools ? (
        tools?.map((tool, index) => (
          <FormSwitch
            checked={tool.enabled}
            label={tool.namespaced_name}
            description={tool.description || undefined}
            key={index}
            handleChange={(checked: boolean) => handleSwitchChange(tool.id, checked)}
            name={tool.namespaced_name}
          />
        ))
      ) : (
        <div />
      )}
    </Form>
  )
}
