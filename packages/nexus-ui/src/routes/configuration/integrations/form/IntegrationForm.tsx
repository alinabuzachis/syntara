import { Button, Form, FormInput, FormSelect } from '@ansible/nexus-ui-framework'
import type { ToolProvider } from 'nexus-contracts'
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
          onSubmit={(toolProvider) => {
            createIntegration(
              { body: toolProvider },
              { onSuccess: () => navigate(AppRoute.Configuration.Integrations.Root) }
            )
          }}
          defaultValues={{
            provider_type: 'mcp-server',
          }}
        >
          <FormSelect<ToolProvider>
            label="Type"
            name="provider_type"
            options={[{ label: 'MCP Server', value: 'mcp-server' }]}
          />
          <FormInput<ToolProvider> label="Name" name="name" placeholder="Enter name" required autoFocus />
          {/* <FormInput<ToolProvider> label="Server name / ID" name="url" placeholder="Enter server name / ID" required /> */}
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
