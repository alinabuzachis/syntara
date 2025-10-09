import { Button, Field, Form, Input, Select } from "ui-framework";
import { navigate } from "wouter/use-browser-location";
import { AppPage } from "../../../../app/AppPage";
import { AppPageHeader } from "../../../../app/AppPageHeader";
import { AppRoute } from "../../../../app/AppRoute";
import { ChatInput } from "../../../../components/chat/ChatInput";
import type { Integration } from "../Integration";
import { useIntegrations } from "../useIntegrations";

export function IntegrationForm() {
  const { addResource: addIntegration } = useIntegrations();
  return (
    <AppPage>
      <AppPageHeader title="Configure Integration">
        <div className="grow" />
        <Button type="submit" form="integration-form">
          Add integration
        </Button>
        <Button variant="secondary">Test Integration</Button>
        {/* <div className="grow" /> */}
        <Button
          variant="secondary"
          onClick={() => navigate(AppRoute.Configuration.Integrations.Root)}
        >
          Cancel
        </Button>
      </AppPageHeader>
      <div className="grid grid-cols-2 gap-4 grow">
        <Form
          className="flex flex-col gap-4 glass border grow p-8 rounded-4xl"
          id="integration-form"
          onSubmit={(e) => {
            const data = new FormData(e.currentTarget);
            const integration = Object.fromEntries(
              data.entries()
            ) as unknown as Omit<Integration, "id">;
            addIntegration(integration);
            e.preventDefault();
            navigate(AppRoute.Configuration.Integrations.Root);
          }}
        >
          <Field label="Type" name="type">
            <Select options={[{ label: "MCP Server", value: "mcp-server" }]} />
          </Field>
          <Field label="Name" name="name">
            <Input placeholder="Enter name" required />
          </Field>
          <Field label="Server name / ID" name="url">
            <Input placeholder="Enter server name / ID" required />
          </Field>
        </Form>
        <div className="flex flex-col gap-4 glass border grow p-8 rounded-4xl justify-center text-balance items-center">
          Test the integration to identify and manage the tools it provides.
          <Button>Test Integration</Button>
        </div>
      </div>
      <ChatInput />
    </AppPage>
  );
}
