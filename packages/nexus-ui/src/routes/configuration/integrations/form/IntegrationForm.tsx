import type { ToolProvider } from '@ansible/nexus-contracts'
import { Button, Form, FormButtonGroup, FormInput, Scrollable } from '@ansible/nexus-ui-framework'
import { ServerIcon } from 'lucide-react'
import { navigate } from 'wouter/use-browser-location'
import { AppPage } from '../../../../app/AppPage'
import { AppPageHeader } from '../../../../app/AppPageHeader'
import { AppRoute } from '../../../../app/AppRoute'
import { toolProvidersClient } from '../../../../client'
import { ChatInput } from '../../../../components/chat/ChatInput'

export function IntegrationForm() {
  const { mutate: createIntegration } = toolProvidersClient.useMutation('post', '/tool-providers')
  return (
    <AppPage>
      <AppPageHeader title="Configure Integration">
        <div className="grow" />
        <Button type="submit" form="integration-form">
          Add integration
        </Button>
        <Button variant="secondary" onClick={() => navigate(AppRoute.Configuration.Integrations.Root)}>
          Cancel
        </Button>
      </AppPageHeader>
      <Scrollable className="grid h-full grow">
        <Form<ToolProvider>
          id="integration-form"
          className="glass flex min-h-full flex-col gap-4 rounded-4xl border p-8"
          onSubmit={(toolProvider: ToolProvider) => {
            createIntegration(
              { body: toolProvider },
              { onSuccess: () => navigate(AppRoute.Configuration.Integrations.Root) }
            )
          }}
          defaultValues={{
            configuration: { provider_type: 'mcp' },
          }}
        >
          <FormButtonGroup<ToolProvider>
            label="Integration type"
            name="configuration.provider_type"
            options={[{ label: 'MCP Server', value: 'mcp', icon: <ServerIcon /> }]}
          />
          <FormInput<ToolProvider> label="Server name / ID" name="name" placeholder="Enter server name / ID" required />
          <FormInput<ToolProvider> label="Description" name="description" placeholder="Enter description" />
          <FormInput<ToolProvider> label="API URL" name="configuration.base_url" placeholder="Enter API URL" required />
        </Form>
      </Scrollable>
      <ChatInput />
    </AppPage>
  )
}
