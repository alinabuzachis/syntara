import Fuse from "fuse.js";
import { useState } from "react";
import { AppPage } from "../../../app/AppPage";
import { AppPageHeader } from "../../../app/AppPageHeader";
import { ChatInput } from "../../../components/chat/ChatInput";
import { Scrollable } from "../../../components/Scrollable";
import { IntegrationCard } from "./IntegrationCard";
import { useIntegrations } from "./useIntegrations";

export default function Integrations() {
  const [search, setSearch] = useState("");
  const { resources: integrations } = useIntegrations();
  const fuse = new Fuse(integrations, {
    keys: [
      { name: "name", weight: 0.5 },
      { name: "type", weight: 0.3 },
      { name: "description", weight: 0.2 },
    ],
    threshold: 0.7,
  });
  const results = search
    ? fuse.search(search).map((result) => result.item)
    : integrations;

  return (
    <AppPage>
      <AppPageHeader title="Integrations">
        {/* <ExampleToggleGroup /> */}
        <input
          className="search grow"
          placeholder="Search integrations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="bg-blue-400/70 px-4 py-1 rounded-full">
          Add Integration
        </button>
      </AppPageHeader>
      <Scrollable className="glass rounded-3xl border">
        <div
          className={`p-8 grid gap-4 grid-cols-[repeat(auto-fit,minmax(350px,1fr))]`}
        >
          {results.map((integration) => (
            <IntegrationCard key={integration.id} {...integration} />
          ))}
        </div>
      </Scrollable>
      <ChatInput />
    </AppPage>
  );
}
