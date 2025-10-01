import { navigate } from "wouter/use-browser-location";
import { AppPage } from "../../../../app/AppPage";
import { AppPageHeader } from "../../../../app/AppPageHeader";
import { AppRoute } from "../../../../app/AppRoute";
import { ChatInput } from "../../../../components/chat/ChatInput";
import { Form } from "../../../../components/form/Form";
import { Input } from "../../../../components/form/Input";
import { Select } from "../../../../components/form/Select";

export function IntegrationForm() {
  return (
    <AppPage>
      <AppPageHeader title="Configure Integration">
        <div className="grow" />
        {/* <button
          className="bg-white/10 px-4 py-1 rounded-full self-end"
          onClick={() => navigate(AppRoute.Configuration.Integrations.Root)}
        >
          Cancel
        </button> */}
      </AppPageHeader>
      <div className="grid grid-cols-2 gap-6 grow">
        <Form className="flex flex-col gap-4 glass border grow p-8 rounded-3xl">
          <Select
            name="type"
            label="Type"
            options={[{ label: "MCP Server", value: "mcp-server" }]}
          />
          <Input name="name" label="Name" placeholder="Enter name" />
          <Input
            name="url"
            label="Server name / ID"
            placeholder="Enter server name / ID"
          />
          <Input name="name" label="Name" placeholder="Enter name" />
          <button className="bg-white/10 px-4 py-1 rounded-full mt-8 self-start">
            Test Integration
          </button>
        </Form>
        <div className="flex flex-col gap-4 glass border grow p-8 rounded-3xl justify-center text-balance">
          Test the integration to identify and manage the tools it provides.
        </div>
      </div>
      <div className="glass border px-8 py-6 rounded-3xl flex gap-4">
        <button
          className="bg-blue-400/40 px-4 py-1 rounded-full self-end"
          onClick={() => navigate(AppRoute.Configuration.Integrations.Root)}
        >
          Add integration
        </button>
        <button
          className="bg-white/10 px-4 py-1 rounded-full self-end"
          onClick={() => navigate(AppRoute.Configuration.Integrations.Root)}
        >
          Cancel
        </button>
      </div>
      <ChatInput />
    </AppPage>
  );
}
