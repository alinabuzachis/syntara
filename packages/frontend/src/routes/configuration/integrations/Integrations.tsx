import Fuse from "fuse.js";
import { useState } from "react";
import { useLocation } from "wouter";
import { AppPage } from "../../../app/AppPage";
import { AppPageHeader } from "../../../app/AppPageHeader";
import { AppRoute } from "../../../app/AppRoute";
import { ChatInput } from "../../../components/chat/ChatInput";
import { Scrollable } from "../../../components/Scrollable";
import { IntegrationCard } from "./IntegrationCard";
import { useIntegrations } from "./useIntegrations";

export default function Integrations() {
  const [_, navigate] = useLocation();
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
  const useCards = false;
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
        <button
          className="bg-blue-400/70 px-4 py-1 rounded-full"
          onClick={() =>
            navigate(AppRoute.Configuration.Integrations.Configure)
          }
        >
          Add Integration
        </button>
        {/* <ExampleToggleGroup /> */}
      </AppPageHeader>
      {!useCards ? (
        <Scrollable
          className="glass rounded-4xl border p-8"
          render={
            <table className="w-full rounded-t-2xl overflow-scroll">
              <thead>
                <tr className="border-b border-white/20 text-left">
                  <th className="px-6 py-4 bg-white/10 rounded-tl-3xl">Name</th>
                  <th className="px-6 py-4 bg-white/10 rounded-tr-3xl">Type</th>
                </tr>
              </thead>
              <tbody>
                {results.map((integration) => (
                  <tr key={integration.id} className="border-b border-white/20">
                    <td className="px-6 py-4">{integration.name}</td>
                    <td className="px-6 py-4">{integration.type}</td>
                  </tr>
                ))}
                {results.map((integration) => (
                  <tr key={integration.id} className="border-b border-white/20">
                    <td className="px-6 py-4">{integration.name}</td>
                    <td className="px-6 py-4">{integration.type}</td>
                  </tr>
                ))}
                {results.map((integration) => (
                  <tr key={integration.id} className="border-b border-white/20">
                    <td className="px-6 py-4">{integration.name}</td>
                    <td className="px-6 py-4">{integration.type}</td>
                  </tr>
                ))}
                {results.map((integration) => (
                  <tr key={integration.id} className="border-b border-white/20">
                    <td className="px-6 py-4">{integration.name}</td>
                    <td className="px-6 py-4">{integration.type}</td>
                  </tr>
                ))}
                {results.map((integration) => (
                  <tr key={integration.id} className="border-b border-white/20">
                    <td className="px-6 py-4">{integration.name}</td>
                    <td className="px-6 py-4">{integration.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        ></Scrollable>
      ) : (
        <Scrollable className="glass rounded-4xl border">
          <div
            className={`p-8 grid gap-4 grid-cols-[repeat(auto-fit,minmax(350px,1fr))]`}
          >
            {results.map((integration) => (
              <IntegrationCard key={integration.id} {...integration} />
            ))}
          </div>
        </Scrollable>
      )}
      <ChatInput />
    </AppPage>
  );
}
