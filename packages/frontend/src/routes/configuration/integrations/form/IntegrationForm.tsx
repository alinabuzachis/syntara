import { navigate } from "wouter/use-browser-location";
import { AppPage } from "../../../../app/AppPage";
import { AppPageHeader } from "../../../../app/AppPageHeader";
import { AppRoute } from "../../../../app/AppRoute";
import { ChatInput } from "../../../../components/chat/ChatInput";
import { Field } from "../../../../components/form/Field";
import { Form } from "../../../../components/form/Form";
import { Input } from "../../../../components/form/Input";
import { Select } from "../../../../components/form/Select";
import type { Integration } from "../Integration";
import { useIntegrations } from "../useIntegrations";

export function IntegrationForm() {
  const { addResource: addIntegration } = useIntegrations();
  return (
    <AppPage>
      <AppPageHeader title="Configure Integration">
        <div className="grow" />
        <button
          className="bg-blue-400/40 px-4 py-1 rounded-full self-end"
          type="submit"
          form="integration-form"
        >
          Add integration
        </button>
        <button className="bg-white/10 px-4 py-1 rounded-full self-start">
          Test Integration
        </button>
        {/* <div className="grow" /> */}
        <button
          className="bg-white/10 px-4 py-1 rounded-full self-end"
          onClick={() => navigate(AppRoute.Configuration.Integrations.Root)}
        >
          Cancel
        </button>
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
          {/* <button className="bg-white/10 px-4 py-1 rounded-full mt-8 self-start">
            Test Integration
          </button> */}
        </Form>
        <div className="flex flex-col gap-4 glass border grow p-8 rounded-4xl justify-center text-balance items-center">
          Test the integration to identify and manage the tools it provides.
          <button className="bg-white/10 px-4 py-1 rounded-full mt-8">
            Test Integration
          </button>
        </div>
      </div>
      {/* <div className="glass border px-8 py-6 rounded-4xl flex gap-4">
        <button
          className="bg-blue-400/40 px-4 py-1 rounded-full self-end"
          type="submit"
          form="integration-form"
        >
          Add integration
        </button>
        <button className="bg-white/10 px-4 py-1 rounded-full self-start">
          Test Integration
        </button>
        <div className="grow" />
        <button
          className="bg-white/10 px-4 py-1 rounded-full self-end"
          onClick={() => navigate(AppRoute.Configuration.Integrations.Root)}
        >
          Cancel
        </button>
      </div> */}
      <ChatInput />
    </AppPage>
  );
}
