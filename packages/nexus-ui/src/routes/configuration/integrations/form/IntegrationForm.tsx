import type { ToolProvider } from '@ansible/nexus-contracts'
import { Button, Form, FormInput, FormSelect } from '@ansible/nexus-ui-framework'
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
        <Button variant="secondary">Test Integration</Button>
        {/* <div className="grow" /> */}
        <Button variant="secondary" onClick={() => navigate(AppRoute.Configuration.Integrations.Root)}>
          Cancel
        </Button>
      </AppPageHeader>
      <div className="grid grow grid-cols-2 gap-4">
        <Form<ToolProvider>
          id="integration-form"
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
          <FormSelect<ToolProvider>
            label="Type"
            name="configuration.provider_type"
            options={[{ label: 'MCP Server', value: 'mcp-server' }]}
          />
          <FormInput<ToolProvider> label="Server name / ID" name="name" placeholder="Enter server name / ID" required />
          <FormInput<ToolProvider> label="Description" name="description" placeholder="Enter description" autoFocus />
          <FormInput<ToolProvider> label="API URL" name="configuration.url" placeholder="Enter API URL" required />
        </Form>
        <div className="glass flex grow flex-col items-center justify-center gap-4 rounded-4xl border p-8 text-balance">
          Test the integration to identify and manage the tools it provides.
          <Button>Test Integration</Button>
        </div>
      </div>
      <ChatInput />
    </AppPage>
  )
}
